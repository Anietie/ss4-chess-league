import { createServerClient } from "../src/lib/supabase";

const supabase = createServerClient();
const arg = (n: string) =>
  process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
async function whatsappAnnounce() {
  const season = Number(arg("season") ?? 1);
  const round = Number(arg("round") ?? 1);

  const { data: games } = await supabase
    .from("games")
    .select(
      `result, white_player:players!games_white_player_id_fkey(full_name), black_player:players!games_black_player_id_fkey(full_name), white_rating_after, black_rating_after, white_rating_before, black_rating_before`,
    )
    .eq("season", season)
    .eq("round", round)
    .neq("result", "*");

  if (!games?.length) {
    console.log("No completed results for that round.");
    return;
  }

  let message = `🏆 *SS4 Chess League — Season ${season} Round ${round} Results*\n\n`;
  for (const g of games) {
    const w = (g.white_player as any)?.full_name ?? "White";
    const b = (g.black_player as any)?.full_name ?? "Black";
    const res =
      g.result === "1-0"
        ? `*${w}* wins`
        : g.result === "0-1"
          ? `*${b}* wins`
          : "Draw";
    message += `⚔️ ${w} vs ${b}: ${res} (${g.result})\n`;
  }
  message += `\nView standings: https://ss4chess.com`;

  console.log("Message preview:\n");
  console.log(message);

  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.log("\n⚠️  No TWILIO credentials — message not sent.");
    return;
  }

  // Twilio send (requires 'twilio' npm package: npm install twilio)
  const twilio = require("twilio");
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
  );
  const to = process.env.WHATSAPP_GROUP_NUMBER!;
  await client.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
    to: `whatsapp:${to}`,
    body: message,
  });
  console.log("\n✓ Sent via WhatsApp.");
}
whatsappAnnounce().catch(console.error);
