// Test-only stand-in for api.mistral.ai (chat completions) so the pipeline plumbing can be exercised without an API key.
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

const completion = (text) => ({ id: "cmpl_mock", object: "chat.completion", model: "mock", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: text } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } });

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.headers.authorization !== "Bearer test") { res.writeHead(401); return res.end("{}"); }
    const j = JSON.parse(body || "{}");
    const sys = j.messages.find((m) => m.role === "system")?.content ?? "";
    const user = j.messages.find((m) => m.role === "user")?.content ?? "";
    if (j.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunks = dateText.match(/[\s\S]{1,24}/g);
      let i = 0;
      const t = setInterval(() => {
        if (i < chunks.length) return res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: chunks[i++] } }] })}\n\n`);
        clearInterval(t);
        res.write("data: [DONE]\n\n");
        res.end();
      }, 15);
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (sys.includes("Profile Analyst")) {
      const nm = (user.match(/Person name hint: (.*)/) || [])[1] || "Test Person";
      return res.end(JSON.stringify(completion(JSON.stringify(profile(nm)))));
    }
    if (sys.includes("Matchmaker")) {
      const cands = JSON.parse(user.match(/<candidates>\n([\s\S]*)\n<\/candidates>/)[1]);
      return res.end(JSON.stringify(completion(JSON.stringify({ ranking: cands.map((c, k) => ({ id: c.id, score: 90 - k * 7, reason: `Mock reason for ${c.id}` })) }))));
    }
    res.end(JSON.stringify(completion("{}")));
  });
}).listen(port, () => console.log("mock mistral on", port));
