import net from "node:net";

const listenPort = Number(process.env.GATEWAY_FORWARD_PORT ?? 8443);
const targetHost = process.env.GATEWAY_FORWARD_TARGET_HOST ?? "ccproxy.yukework.com";
const targetPort = Number(process.env.GATEWAY_FORWARD_TARGET_PORT ?? 443);
const allowedSource = /^(?:127\.0\.0\.1|::1|::ffff:127\.0\.0\.1|192\.168\.65\.\d{1,3})$/;

const server = net.createServer((client) => {
  const address = client.remoteAddress ?? "";
  if (!allowedSource.test(address)) {
    console.warn(`Rejected non-Docker source: ${address}`);
    client.destroy();
    return;
  }

  const upstream = net.connect(targetPort, targetHost);
  client.on("close", () => upstream.destroy());
  upstream.on("close", () => client.destroy());
  client.setTimeout(300_000,()=>client.destroy());
  upstream.setTimeout(300_000,()=>upstream.destroy());
  upstream.on("connect", () => client.pipe(upstream).pipe(client));
  upstream.on("error", (error) => {
    console.warn(`Gateway forward failed: ${error.code ?? error.message}`);
    client.destroy();
  });
  client.on("error", () => upstream.destroy());
});

server.listen(listenPort, "0.0.0.0", () => {
  console.log(`Gateway forwarder listening on ${listenPort} for Docker Desktop only`);
});
