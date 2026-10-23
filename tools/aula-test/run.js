const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const srv = http.createServer((q, r) => {
  const f = path.join(__dirname, q.url === "/" ? "page.html" : q.url.split("?")[0]);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html" }); r.end(d); } });
}).listen(0);
let pass = 0, fail = 0;
const ok = (c, name, extra = "") => { (c ? pass++ : fail++); console.log((c ? "  ok   " : "  FAIL ") + name + (c ? "" : "  " + extra)); };

(async () => {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}), headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--disable-features=WebRtcHideLocalIpsWithMdns", "--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
  });
  const page = await (await browser.newContext({ permissions: ["camera", "microphone"] })).newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
  await page.goto(`http://localhost:${srv.address().port}/`);

  const res = await page.evaluate(async () => {
    const out = []; const ck = (c, n, x = "") => out.push([!!c, n, String(x)]);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (fn, ms = 15000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await sleep(step); } return false; };
    // reproduz um stream num <video> e confirma que chegam imagens
    const frames = async (stream, ms = 8000) => {
      if (!stream) return 0;
      const v = document.createElement("video"); v.muted = true; v.autoplay = true; v.playsInline = true; v.srcObject = stream; document.body.appendChild(v);
      await v.play().catch(() => {});
      await until(() => (v.getVideoPlaybackQuality?.().totalVideoFrames ?? 0) >= 5, ms);
      const n = v.getVideoPlaybackQuality?.().totalVideoFrames ?? 0; v.remove(); return n;
    };
    const T = window.T;
    const roster = [{ uid: "s1", nome: "Ana" }, { uid: "s2", nome: "Bento" }, { uid: "s3", nome: "Clara" }];
    const bus = new T.Bus();
    const host = await T.host(bus, roster);
    host.setSeats(2, "aprovar");
    const s1 = T.student(bus, "s1", "Ana"), s2 = T.student(bus, "s2", "Bento"), s3 = T.student(bus, "s3", "Clara");
    const all = [s1, s2, s3];

    // 1. descida: todos recebem a imagem do professor
    ck(await until(() => all.every((s) => s.status === "ligado")), "1. três alunos ligados ao professor", all.map((s) => s.status));
    const f0 = await frames(s1.stage().host);
    ck(f0 >= 5, "1. aluno vê o vídeo do professor", f0);
    ck(host.state().alunos === 3, "1. professor conta 3 alunos", host.state().alunos);

    // 2. pedir a palavra e subir
    s1.hand(true);
    ck(await until(() => host.hands.has("s1")), "2. pedido de palavra chega ao professor");
    ck(host.handsList()[0]?.nome === "Ana", "2. nome vem do cadastro (não do aluno)");
    ck(host.approve("s1") === null, "2. professor aprova");
    ck(await until(() => s1.iAmSeated), "2. aluno vê que tem cadeira");
    await s1.enableMedia("av");
    ck(await until(() => host.seatStream("s1")?.getTracks().length === 2, 15000), "2. professor recebe câmara+microfone do aluno", s1.error);
    const fHostSees = await frames(host.seatStream("s1"));
    ck(fHostSees >= 5, "2. professor vê o vídeo do aluno", fHostSees);

    // 3. reenvio à turma
    ck(await until(() => s2.stage().seats.find((x) => x.uid === "s1")?.stream), "3. outro aluno recebe a cadeira do s1", JSON.stringify(s2.state?.layout));
    const f2 = await frames(s2.stage().seats.find((x) => x.uid === "s1")?.stream);
    ck(f2 >= 5, "3. outro aluno VÊ o vídeo do s1 reencaminhado pelo professor", f2);
    const aud = s3.stage().seats.find((x) => x.uid === "s1")?.stream?.getAudioTracks().length;
    ck(aud === 1, "3. e recebe o áudio", aud);
    ck(s1.streams.size === 1, "3. s1 não recebe a sua própria imagem de volta (sem eco)", s1.streams.size);
    ck(s1.stage().seats[0].me && s1.stage().seats[0].stream === s1.local, "3. s1 vê a sua pré-visualização local");

    // 4. segunda cadeira, só áudio; limite
    s2.hand(true); await until(() => host.hands.has("s2")); host.approve("s2");
    await until(() => s2.iAmSeated); await s2.enableMedia("audio");
    ck(await until(() => s1.stage().seats.find((x) => x.uid === "s2")?.stream?.getAudioTracks().length === 1, 15000), "4. s1 ouve o s2 (só áudio)");
    ck(await until(() => s3.stage().seats.filter((x) => x.stream).length === 2, 15000), "4. s3 recebe as duas cadeiras", s3.stage().seats.map(x=>x.uid+':'+!!x.stream));
    s3.hand(true); await until(() => host.hands.has("s3"));
    ck(host.approve("s3") === "Não há cadeiras livres.", "4. limite de cadeiras respeitado");
    const inb = async (s) => { const st = await s.down.getStats(); let n = 0; st.forEach((r) => { if (r.type === "inbound-rtp" && r.kind === "audio" && r.packetsReceived > 5) n++; }); return n; };
    await sleep(1500);
    const na = await inb(s3);
    ck(na === 3, "4. s3 recebe 3 fluxos de áudio com pacotes (professor + 2 cadeiras)", na);
    host.decline("s3"); ck(await until(() => !s3.myHand), "4. recusar limpa a mão do aluno");

    // 5. mute pelo professor + revogar
    host.mute("s2", true);
    ck(host.seatStream("s2").getAudioTracks().every((t) => t.enabled === false), "5. professor silencia o s2 (faixa desligada no reenvio)");
    ck(await until(() => s3.mutedByHost === false && s2.mutedByHost), "5. s2 sabe que foi silenciado");
    host.revoke("s1");
    ck(await until(() => !s1.iAmSeated && s1.local === null), "5. revogar tira a cadeira e desliga a câmara do aluno");
    ck(await until(() => !s3.stage().seats.some((x) => x.uid === "s1")), "5. s3 deixa de ver a cadeira do s1");
    ck(await until(() => host.seatStream("s1") === null), "5. professor fecha a subida do s1");

    // 6. chat seguro
    s3.sendChat("Bom dia, professor", true);
    ck(await until(() => s1.chat.some((c) => c.texto === "Bom dia, professor" && c.nome === "Clara" && c.pergunta && !c.host)), "6. chat chega a todos com o nome do cadastro");
    s3.sendChat("a"); s3.sendChat("b");
    await sleep(300);
    ck(host.chat.filter((c) => c.uid === "s3").length === 1, "6. anti-spam: mensagens seguidas (<0,8 s) são descartadas", host.chat.filter((c) => c.uid === "s3").length);
    host.sendChat("Boa pergunta!");
    ck(await until(() => s3.chat.some((c) => c.host && c.nome === "Prof")), "6. mensagem do professor marcada como responsável");
    let reacts = []; s2.__r = 1;
    host.onReact = undefined;

    // 7. recuperação: ligação do aluno cai
    s3.down.close();
    ck(await until(() => s3.status === "ligado" && s3.down?.connectionState === "connected", 25000), "7. aluno refaz a ligação sozinho depois de a perder", s3.status + "/" + s3.down?.connectionState);
    ck(await frames(s3.stage().host) >= 5, "7. e volta a ver o professor");

    // 8. cadeira guardada após queda
    s2.hand(false);
    s2.down.close(); s2.up.close();
    ck(await until(() => s2.status === "ligado" && s2.down?.connectionState === "connected", 25000), "8. s2 (sentado) volta a ligar", s2.status);
    ck(host.seated.has("s2"), "8. cadeira do s2 foi mantida durante a queda");
    ck(await until(() => host.seatStream("s2")?.getTracks().length === 1 && host.seatStream("s2").active, 20000), "8. s2 retoma o envio de áudio sem fazer nada");
    ck(await until(() => s3.stage().seats.find((x) => x.uid === "s2")?.stream?.active), "8. turma volta a receber o s2");

    // 9. mesma pessoa noutro separador
    const s2b = T.student(bus, "s2", "Bento");
    ck(await until(() => s2.status === "substituida"), "9. o separador antigo é avisado e pára", s2.status);
    ck(await until(() => s2b.status === "ligado"), "9. o novo separador liga");

    // 10. fim da aula
    host.end();
    ck(await until(() => s1.status === "encerrada" && s3.status === "encerrada" && s2b.status === "encerrada"), "10. todos os alunos ativos recebem 'encerrada'", [s1,s2,s2b,s3].map((s) => s.status));
    ck(host.hostStream === null && host.peers.size === 0, "10. professor limpa tudo");

    // 11. lotação + mensagem perdida
    const bus2 = new T.Bus();
    const h2 = await T.host(bus2, roster, { maxAlunos: 2 });
    let dropped = 0; bus2.drop = (m) => { if (m.t === "offer" && dropped < 1) { dropped++; return true; } return false; };
    const a = T.student(bus2, "s1", "Ana"), b = T.student(bus2, "s2", "Bento");
    ck(await until(() => a.status === "ligado" && b.status === "ligado", 40000), "11. oferta perdida: os alunos acabam por ligar", a.status + b.status + " dropped=" + dropped);
    const c = T.student(bus2, "s3", "Clara");
    ck(await until(() => c.status === "cheia"), "11. turma cheia recusa o terceiro aluno", c.status);
    h2.kick("s1");
    ck(await until(() => a.status === "expulso"), "11. professor remove um aluno");
    h2.end();
    return out;
  });
  for (const [c, n, x] of res) ok(c, n, x);
  console.log(`\n${pass} ok, ${fail} falhas`);
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
