// Test-only stand-in for api.anthropic.com so the pipeline plumbing can be exercised without an API key.
import http from "node:http";
const port = Number(process.env.PORT || 4010);

const profile = (name) => ({
  displayName: name, headline: `${name} - builder and runner`, summary: `${name} publishes about building products and weekend long runs.`,
  needs: ["A partner who respects deep work", "Shared ambition"], hobbies: ["Running", "Reading"], interests: ["AI", "Startups"],
  values: ["Curiosity"], personality: ["Driven - posts about shipping weekly"], communicationStyle: "Direct and warm",
  lookingForInPartner: "Inferred: someone ambitious but grounded.", evidence: [{ claim: "Posts about marathon training", source: "instagram" }, { claim: "Founder role", source: "linkedin" }],
  dataQuality: "rich", caveats: [],
});
const dateText = `A: Hi! My person builds companies and runs marathons - what is yours into?
B: Mine writes and speaks about leadership, and unwinds with long hikes. Do you two share a rhythm?
A: Early mornings, yes. But I should flag mine can disappear into work for days.
B: Honest. Mine values presence, so that is a real friction point worth naming.
A: Fair. What would mine have to offer that balances that?
B: Curiosity - mine loves learning from people with different obsessions.
A: Then they might click over books and long runs.
B: Agreed, with a clear weekly ritual to protect time together.
===VERDICT===
{"aView":{"score":72,"reason":"Shared drive and love of endurance, tempered by work intensity.","spark":"Early mornings and endurance hobbies","friction":"Availability and work intensity"},"bView":{"score":68,"reason":"Curious and ambitious but possibly absent.","spark":"Mutual curiosity","friction":"Presence vs. work obsession"}}`;

function msg(text) {
  return { id: "msg_mock", type: "message", role: "assistant", model: "mock", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
}

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = JSON.parse(body || "{}");
    const sys = String(j.system ?? "");
    if (j.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`);
      ev("message_start", { message: { ...msg(""), content: [] } });
      ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      const chunks = dateText.match(/[\s\S]{1,24}/g);
      let i = 0;
      const t = setInterval(() => {
        if (i < chunks.length) return ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: chunks[i++] } });
        clearInterval(t);
        ev("content_block_stop", { index: 0 });
        ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 99 } });
        ev("message_stop", {});
        res.end();
      }, 15);
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (sys.includes("Profile Analyst")) {
      const nm = (j.messages[0].content.match(/Person name hint: (.*)/) || [])[1] || "Test Person";
      return res.end(JSON.stringify(msg(JSON.stringify(profile(nm)))));
    }
    if (sys.includes("Matchmaker")) {
      const cands = JSON.parse(j.messages[0].content.match(/<candidates>\n([\s\S]*)\n<\/candidates>/)[1]);
      return res.end(JSON.stringify(msg(JSON.stringify({ ranking: cands.map((c, k) => ({ id: c.id, score: 90 - k * 7, reason: `Mock reason for ${c.id}` })) }))));
    }
    res.end(JSON.stringify(msg("{}")));
  });
}).listen(port, () => console.log("mock anthropic on", port));
