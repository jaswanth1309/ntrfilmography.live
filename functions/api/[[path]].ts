import { handle } from "hono/cloudflare-pages";
import { api } from "../../src/server/api";

export const onRequest = handle(api);
