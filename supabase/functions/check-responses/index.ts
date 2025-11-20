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

    // Получаем все ping tracking записи со статусом awaiting_response
    const trackingsRes = await fetch(
      `${supabaseUrl}/rest/v1/mailing_ping_tracking?status=eq.awaiting_response&select=*,recipient:mailing_recipients!mailing_ping_tracking_mailing_recipient_id_fkey(id,mailing:mailings(id,user_id),contact:contacts(email),sender_email:emails(email,password))`,
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
        JSON.stringify({ success: true, message: "No trackings to check", checked: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let checkedCount = 0;
    let responsesFound = 0;

    for (const tracking of trackings) {
      try {
        const senderEmail = tracking.recipient?.sender_email;
        if (!senderEmail) continue;

        const imapHost = Deno.env.get("IMAP_HOST") || "imap.hostinger.com";
        const imapPort = Number(Deno.env.get("IMAP_PORT") || "993");

        const imapConn = await Deno.connect({
          hostname: imapHost,
          port: imapPort,
          transport: "tcp"
        });
        const imapTls = await Deno.startTls(imapConn, { hostname: imapHost });

        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        const readImap = async () => {
          const buf = new Uint8Array(8192);
          const n = await imapTls.read(buf);
          if (n === null) return "";
          return decoder.decode(buf.subarray(0, n));
        };

        const writeImap = async (line: string) => {
          await imapTls.write(encoder.encode(line + "\r\n"));
        };

        // Читаем приветствие
        await readImap();

        // Логин
        const tagLogin = "A001";
        await writeImap(`${tagLogin} LOGIN "${senderEmail.email.replace(/"/g, '\\"')}" "${senderEmail.password.replace(/"/g, '\\"')}"`);
        let loginResp = "";
        for (;;) {
          const chunk = await readImap();
          loginResp += chunk;
          if (loginResp.includes(`${tagLogin} OK`) || loginResp.includes(`${tagLogin} NO`) || loginResp.includes(`${tagLogin} BAD`)) break;
        }

        if (!loginResp.includes(`${tagLogin} OK`)) {
          console.error("IMAP login failed for", senderEmail.email);
          try { imapTls.close(); } catch (e) {}
          continue;
        }

        // Выбираем INBOX
        const tagSelect = "A002";
        await writeImap(`${tagSelect} SELECT INBOX`);
        let selectResp = "";
        for (;;) {
          const chunk = await readImap();
          selectResp += chunk;
          if (selectResp.includes(`${tagSelect} OK`) || selectResp.includes(`${tagSelect} NO`) || selectResp.includes(`${tagSelect} BAD`)) break;
        }

        if (!selectResp.includes(`${tagSelect} OK`)) {
          console.error("IMAP SELECT failed");
          try { imapTls.close(); } catch (e) {}
          continue;
        }

        // Ищем письма от контакта после даты отправки
        const contactEmail = tracking.recipient?.contact?.email;
        if (!contactEmail) {
          try { imapTls.close(); } catch (e) {}
          continue;
        }

        const sentDate = new Date(tracking.initial_sent_at);
        const searchDate = sentDate.toISOString().split('T')[0].replace(/-/g, '-');

        const tagSearch = "A003";
        await writeImap(`${tagSearch} SEARCH FROM "${contactEmail}" SINCE "${searchDate}"`);
        let searchResp = "";
        for (;;) {
          const chunk = await readImap();
          searchResp += chunk;
          if (searchResp.includes(`${tagSearch} OK`) || searchResp.includes(`${tagSearch} NO`) || searchResp.includes(`${tagSearch} BAD`)) break;
        }

        // Проверяем есть ли результаты
        const hasResults = searchResp.includes("* SEARCH") && searchResp.match(/\* SEARCH (\d+)/);

        try {
          await writeImap("A004 LOGOUT");
          await readImap();
        } catch (e) {}
        try { imapTls.close(); } catch (e) {}

        checkedCount++;

        // Если нашли ответ - обновляем статус
        if (hasResults) {
          responsesFound++;

          await fetch(`${supabaseUrl}/rest/v1/mailing_ping_tracking?id=eq.${tracking.id}`, {
            method: "PATCH",
            headers: {
              "apikey": supabaseServiceKey,
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
              "Prefer": "return=minimal",
            },
            body: JSON.stringify({
              response_received: true,
              response_received_at: new Date().toISOString(),
              status: "response_received",
            }),
          });

          console.log(`Response found for tracking ${tracking.id}`);
        }

      } catch (err) {
        console.error("Error checking response for tracking:", tracking.id, err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Responses checked",
        checked: checkedCount,
        responsesFound
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Check responses error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
