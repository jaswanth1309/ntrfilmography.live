import { generateSitemapXml } from "../src/server/api";

export async function onRequest(context: { request: Request; env: any }): Promise<Response> {
  const c = {
    env: context.env || {},
    req: context.request,
  };
  return generateSitemapXml(c);
}
