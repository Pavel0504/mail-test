import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SendEmailRequest {
  recipient_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { recipient_id } = await req.json() as SendEmailRequest;

    const recipientRes = await fetch(`${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}&select=*,mailing:mailings(*),contact:contacts(*),sender_email:emails(*)`, {
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
    });

    const recipients = await recipientRes.json();
    if (!recipients || recipients.length === 0) {
      throw new Error("Recipient not found");
    }

    const recipient = recipients[0];
    const { mailing, contact, sender_email } = recipient;

    if (recipient.status !== "pending") {
      return new Response(
        JSON.stringify({ success: false, message: "Already processed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailContent = mailing.html_content || mailing.text_content;
    if (!emailContent) {
      throw new Error("No email content");
    }

    const smtpHost = "smtp.hostinger.com";
    const smtpPort = 465;
    const smtpUser = sender_email.email;
    const smtpPass = sender_email.password;

    let emailBody = "";

    emailBody += `From: ${smtpUser}\r\n`;
    emailBody += `To: ${contact.email}\r\n`;
    emailBody += `Subject: ${mailing.subject}\r\n`;
    emailBody += `MIME-Version: 1.0\r\n`;

    const hasText = !!mailing.text_content;
    const hasHtml = !!mailing.html_content;

    if (hasText && hasHtml) {
      const boundary = "----=_Part_" + Date.now();
      emailBody += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
      emailBody += `\r\n`;

      emailBody += `--${boundary}\r\n`;
      emailBody += `Content-Type: text/plain; charset=UTF-8\r\n`;
      emailBody += `\r\n`;
      emailBody += `${mailing.text_content}\r\n`;
      emailBody += `\r\n`;

      emailBody += `--${boundary}\r\n`;
      emailBody += `Content-Type: text/html; charset=UTF-8\r\n`;
      emailBody += `\r\n`;
      emailBody += `${mailing.html_content}\r\n`;

      emailBody += `--${boundary}--\r\n`;
    } else if (hasText) {
      emailBody += `Content-Type: text/plain; charset=UTF-8\r\n`;
      emailBody += `\r\n`;
      emailBody += `${mailing.text_content}\r\n`;
    } else if (hasHtml) {
      emailBody += `Content-Type: text/html; charset=UTF-8\r\n`;
      emailBody += `\r\n`;
      emailBody += `${mailing.html_content}\r\n`;
    }

    const conn = await Deno.connect({
      hostname: smtpHost,
      port: smtpPort,
      transport: "tcp",
    });

    const tlsConn = await Deno.startTls(conn, { hostname: smtpHost });
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const readLine = async () => {
      const buffer = new Uint8Array(1024);
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

    const base64User = btoa(smtpUser);
    await writeLine(base64User);
    await readLine();

    const base64Pass = btoa(smtpPass);
    await writeLine(base64Pass);
    const authResponse = await readLine();

    if (!authResponse.startsWith("235")) {
      tlsConn.close();
      throw new Error("SMTP authentication failed");
    }

    await writeLine(`MAIL FROM:<${smtpUser}>`);
    await readLine();

    await writeLine(`RCPT TO:<${contact.email}>`);
    const rcptResponse = await readLine();

    if (!rcptResponse.startsWith("250")) {
      tlsConn.close();
      throw new Error("Recipient rejected");
    }

    await writeLine("DATA");
    await readLine();

    await tlsConn.write(encoder.encode(emailBody));
    await writeLine(".");
    const dataResponse = await readLine();

    await writeLine("QUIT");
    tlsConn.close();

    if (!dataResponse.startsWith("250")) {
      throw new Error("Email sending failed");
    }

    await fetch(`${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}`, {
      method: "PATCH",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        status: "sent",
        sent_at: new Date().toISOString(),
      }),
    });

    await fetch(`${supabaseUrl}/rest/v1/emails?id=eq.${sender_email.id}`, {
      method: "PATCH",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        sent_count: sender_email.sent_count + 1,
        success_count: sender_email.success_count + 1,
      }),
    });

    const mailingRes = await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailing.id}&select=sent_count,success_count`, {
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
    });
    const mailings = await mailingRes.json();
    const currentMailing = mailings[0];

    await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailing.id}`, {
      method: "PATCH",
      headers: {
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        sent_count: currentMailing.sent_count + 1,
        success_count: currentMailing.success_count + 1,
      }),
    });

    const allRecipientsRes = await fetch(
      `${supabaseUrl}/rest/v1/mailing_recipients?mailing_id=eq.${mailing.id}&select=status`,
      {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
      }
    );
    const allRecipients = await allRecipientsRes.json();
    const allProcessed = allRecipients.every((r: { status: string }) => r.status !== "pending");

    if (allProcessed) {
      const hasFailures = allRecipients.some((r: { status: string }) => r.status === "failed");
      const finalStatus = hasFailures ? "completed" : "completed";

      await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailing.id}`, {
        method: "PATCH",
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ status: finalStatus }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const body = await req.text();
      const { recipient_id } = JSON.parse(body) as SendEmailRequest;

      const recipientRes = await fetch(`${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}&select=*,mailing:mailings(*),sender_email:emails(*)`, {
        headers: {
          "apikey": supabaseServiceKey,
          "Authorization": `Bearer ${supabaseServiceKey}`,
        },
      });

      const recipients = await recipientRes.json();
      if (recipients && recipients.length > 0) {
        const recipient = recipients[0];
        const { mailing, sender_email } = recipient;

        await fetch(`${supabaseUrl}/rest/v1/mailing_recipients?id=eq.${recipient_id}`, {
          method: "PATCH",
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            status: "failed",
            error_message: errorMessage,
          }),
        });

        await fetch(`${supabaseUrl}/rest/v1/emails?id=eq.${sender_email.id}`, {
          method: "PATCH",
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            sent_count: sender_email.sent_count + 1,
            failed_count: sender_email.failed_count + 1,
          }),
        });

        const mailingRes = await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailing.id}&select=sent_count,failed_count`, {
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
        });
        const mailings = await mailingRes.json();
        const currentMailing = mailings[0];

        await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailing.id}`, {
          method: "PATCH",
          headers: {
            "apikey": supabaseServiceKey,
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            sent_count: currentMailing.sent_count + 1,
            failed_count: currentMailing.failed_count + 1,
          }),
        });

        const allRecipientsRes = await fetch(
          `${supabaseUrl}/rest/v1/mailing_recipients?mailing_id=eq.${mailing.id}&select=status`,
          {
            headers: {
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
          }
        );
        const allRecipients = await allRecipientsRes.json();
        const allProcessed = allRecipients.every((r: { status: string }) => r.status !== "pending");

        if (allProcessed) {
          await fetch(`${supabaseUrl}/rest/v1/mailings?id=eq.${mailing.id}`, {
            method: "PATCH",
            headers: {
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
              "Prefer": "return=minimal",
            },
            body: JSON.stringify({ status: "completed" }),
          });
        }
      }
    } catch (e) {
      console.error("Failed to update recipient status:", e);
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});