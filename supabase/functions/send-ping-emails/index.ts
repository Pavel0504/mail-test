import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Получаем все ping tracking записи, которые ждут ответа и прошло достаточно времени
    const trackingsRes = await fetch(
      `${supabaseUrl}/rest/v1/mailing_ping_tracking?status=eq.awaiting_response&select=*,recipient:mailing_recipients!mailing_ping_tracking_mailing_recipient_id_fkey(id,contact:contacts(id,email,name),sender_email:emails(id,email,password),mailing:mailings(id,user_id))`,
      {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
      }
    );

    const trackings = await trackingsRes.json();

    if (!trackings || trackings.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No ping emails to send", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const tracking of trackings) {
      try {
        const contact = tracking.recipient?.contact;
        const senderEmail = tracking.recipient?.sender_email;

        if (!contact || !senderEmail) {
          skippedCount++;
          continue;
        }

        // Получаем глобальные настройки пинг-системы
        const { data: pingSettings } = await fetch(
          `${supabaseUrl}/rest/v1/ping_settings?select=wait_time_hours&limit=1`,
          {
            headers: {
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
          }
        ).then(r => r.json()).then(d => ({ data: d[0] }));

        const waitTimeHours = pingSettings?.wait_time_hours || 10;

        // Проверяем прошло ли достаточно времени
        const initialSentAt = new Date(tracking.initial_sent_at);
        const now = new Date();
        const hoursPassed = (now.getTime() - initialSentAt.getTime()) / (1000 * 60 * 60);

        // Если время еще не пришло - пропускаем
        if (hoursPassed < waitTimeHours) {
          skippedCount++;
          continue;
        }

        // Получаем настройки контента из группы контакта (если есть)
        const { data: groupMemberships } = await fetch(
          `${supabaseUrl}/rest/v1/contact_group_members?contact_id=eq.${contact.id}&select=group_id`,
          {
            headers: {
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
          }
        ).then(r => r.json());

        let pingSubject = "Follow-up";
        let pingTextContent = "";
        let pingHtmlContent = "";

        if (groupMemberships && groupMemberships.length > 0) {
          const groupId = groupMemberships[0].group_id;
          const { data: group } = await fetch(
            `${supabaseUrl}/rest/v1/contact_groups?id=eq.${groupId}&select=ping_subject,ping_text_content,ping_html_content`,
            {
              headers: {
                "apikey": supabaseServiceKey,
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
            }
          ).then(r => r.json()).then(d => ({ data: d[0] }));

          if (group) {
            pingSubject = group.ping_subject || "Follow-up";
            pingTextContent = group.ping_text_content || "";
            pingHtmlContent = group.ping_html_content || "";
          }
        }

        // Заменяем [NAME] на имя контакта
        const contactName = contact.name || contact.email;
        pingTextContent = pingTextContent.replace(/\[NAME\]/g, contactName);
        pingHtmlContent = pingHtmlContent.replace(/\[NAME\]/g, contactName);

        // Если нет контента для пинга - используем дефолтный
        if (!pingTextContent && !pingHtmlContent) {
          pingTextContent = `Hello ${contactName},\n\nI wanted to follow up on my previous email. Have you had a chance to review it?\n\nBest regards`;
        }

        const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.hostinger.com";
        const smtpPort = Number(Deno.env.get("SMTP_PORT") || "465");

        let emailBody = "";
        const dateHeader = new Date().toUTCString();
        const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${smtpHost}>`;

        emailBody += `From: ${senderEmail.email}\r\n`;
        emailBody += `To: ${contact.email}\r\n`;
        emailBody += `Subject: ${pingSubject}\r\n`;
        emailBody += `Date: ${dateHeader}\r\n`;
        emailBody += `Message-ID: ${messageId}\r\n`;
        emailBody += `MIME-Version: 1.0\r\n`;

        const hasText = !!pingTextContent;
        const hasHtml = !!pingHtmlContent;

        if (hasText && hasHtml) {
          const boundary = "----=_Part_" + Date.now();
          emailBody += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
          emailBody += `\r\n`;

          emailBody += `--${boundary}\r\n`;
          emailBody += `Content-Type: text/plain; charset=UTF-8\r\n`;
          emailBody += `\r\n`;
          emailBody += `${pingTextContent}\r\n`;
          emailBody += `\r\n`;

          emailBody += `--${boundary}\r\n`;
          emailBody += `Content-Type: text/html; charset=UTF-8\r\n`;
          emailBody += `\r\n`;
          emailBody += `${pingHtmlContent}\r\n`;

          emailBody += `\r\n--${boundary}--\r\n`;
        } else if (hasText) {
          emailBody += `Content-Type: text/plain; charset=UTF-8\r\n`;
          emailBody += `\r\n`;
          emailBody += `${pingTextContent}\r\n`;
        } else if (hasHtml) {
          emailBody += `Content-Type: text/html; charset=UTF-8\r\n`;
          emailBody += `\r\n`;
          emailBody += `${pingHtmlContent}\r\n`;
        }

        // SMTP отправка
        const conn = await Deno.connect({
          hostname: smtpHost,
          port: smtpPort,
          transport: "tcp",
        });

        const tlsConn = await Deno.startTls(conn, { hostname: smtpHost });
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        const readLine = async () => {
          const buffer = new Uint8Array(4096);
          const n = await tlsConn.read(buffer);
          if (n === null) return "";
          return decoder.decode(buffer.subarray(0, n));
        };

        const writeLine = async (line: string) => {
          await tlsConn.write(encoder.encode(line + "\r\n"));
        };

        await readLine();
        await writeLine(`EHLO ${smtpHost}`);
        await readLine();

        await writeLine("AUTH LOGIN");
        await readLine();

        const base64User = btoa(senderEmail.email);
        await writeLine(base64User);
        await readLine();

        const base64Pass = btoa(senderEmail.password);
        await writeLine(base64Pass);
        const authResponse = await readLine();

        if (!authResponse.startsWith("235")) {
          tlsConn.close();
          console.error("SMTP authentication failed for ping email:", authResponse);
          skippedCount++;
          continue;
        }

        await writeLine(`MAIL FROM:<${senderEmail.email}>`);
        await readLine();

        await writeLine(`RCPT TO:<${contact.email}>`);
        const rcptResponse = await readLine();

        if (!rcptResponse.startsWith("250")) {
          tlsConn.close();
          console.error("Recipient rejected for ping email:", rcptResponse);
          skippedCount++;
          continue;
        }

        await writeLine("DATA");
        await readLine();

        await tlsConn.write(encoder.encode(emailBody));
        await writeLine(".");
        const dataResponse = await readLine();

        await writeLine("QUIT");
        tlsConn.close();

        if (!dataResponse.startsWith("250")) {
          console.error("Ping email sending failed:", dataResponse);
          skippedCount++;
          continue;
        }

        // Сохраняем в папку Sent (fire-and-forget)
        (async () => {
          try {
            const imapHost = Deno.env.get("IMAP_HOST") || "imap.hostinger.com";
            const imapPort = Number(Deno.env.get("IMAP_PORT") || "993");
            const imapConn = await Deno.connect({ hostname: imapHost, port: imapPort, transport: "tcp" });
            const imapTls = await Deno.startTls(imapConn, { hostname: imapHost });

            const imapDecoder = new TextDecoder();
            const imapEncoder = new TextEncoder();

            const readImap = async () => {
              const buf = new Uint8Array(8192);
              const n = await imapTls.read(buf);
              if (n === null) return "";
              return imapDecoder.decode(buf.subarray(0, n));
            };

            const writeImap = async (line: string) => {
              await imapTls.write(imapEncoder.encode(line + "\r\n"));
            };

            await readImap();

            const tagLogin = "A001";
            await writeImap(`${tagLogin} LOGIN "${senderEmail.email.replace(/"/g, '\\"')}" "${senderEmail.password.replace(/"/g, '\\"')}"`);
            let loginResp = "";
            for (;;) {
              const chunk = await readImap();
              loginResp += chunk;
              if (loginResp.includes(`${tagLogin} OK`) || loginResp.includes(`${tagLogin} NO`) || loginResp.includes(`${tagLogin} BAD`)) break;
            }
            if (!loginResp.includes(`${tagLogin} OK`)) {
              try { imapTls.close(); } catch (e) {}
              return;
            }

            const candidateMailboxes = ['Sent', 'INBOX.Sent', 'Sent Messages', 'Отправленные'];
            const fullMessage = emailBody.endsWith("\r\n") ? emailBody : emailBody + "\r\n";
            const messageBytes = imapEncoder.encode(fullMessage);
            const literalSize = messageBytes.length;

            let appended = false;
            for (const mbox of candidateMailboxes) {
              const tagAppend = "A003";
              await writeImap(`${tagAppend} APPEND "${mbox}" {${literalSize}}`);
              let contResp = await readImap();
              if (contResp.startsWith("+") || contResp.includes("+")) {
                await imapTls.write(messageBytes);
                await imapTls.write(imapEncoder.encode("\r\n"));
                let appendResp = "";
                for (;;) {
                  const chunk = await readImap();
                  appendResp += chunk;
                  if (appendResp.includes(`${tagAppend} OK`) || appendResp.includes(`${tagAppend} NO`) || appendResp.includes(`${tagAppend} BAD`)) break;
                }
                if (appendResp.includes(`${tagAppend} OK`)) {
                  appended = true;
                  break;
                }
              }
            }

            try {
              await writeImap(`A004 LOGOUT`);
              await readImap();
            } catch (e) {}
            try { imapTls.close(); } catch (e) {}
          } catch (imapErr) {
            console.error("Failed to save ping email via IMAP:", imapErr);
          }
        })();

        // Обновляем tracking запись
        const pingSentAt = new Date().toISOString();

        await fetch(`${supabaseUrl}/rest/v1/mailing_ping_tracking?id=eq.${tracking.id}`, {
          method: "PATCH",
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            ping_sent: true,
            ping_sent_at: pingSentAt,
            ping_subject: pingSubject,
            ping_text_content: pingTextContent,
            ping_html_content: pingHtmlContent,
            status: "ping_sent",
            updated_at: pingSentAt,
          }),
        });

        sentCount++;
        console.log(`Ping email sent for tracking ${tracking.id}`);

      } catch (err) {
        console.error("Error sending ping email for tracking:", tracking.id, err);
        skippedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Ping emails processed",
        sent: sentCount,
        skipped: skippedCount
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Send ping emails error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
