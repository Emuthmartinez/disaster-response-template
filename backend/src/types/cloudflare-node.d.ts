/**
 * Declaracion minima de `cloudflare:node`, el modulo integrado del runtime de
 * Workers que permite servir un servidor HTTP de Node (ver src/worker.ts).
 *
 * Se declara a mano en vez de instalar @cloudflare/workers-types: ese paquete
 * redefine globales (fetch, Request, Response...) que ya trae @types/node, y
 * mezclarlos en el mismo tsconfig genera conflictos en TODO el backend, que es
 * codigo de Node salvo este unico fichero.
 */
declare module "cloudflare:node" {
  interface WorkerEntrypointLike {
    fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
  }

  /**
   * Servidor estilo Node tal como lo acepta el runtime. Se declara con la
   * superficie MINIMA que usa el handler (listen/address) en vez de tipar
   * `http.Server` entero: asi `createServer(app)` encaja sin arrastrar aqui los
   * tipos DOM que este fichero existe justamente para no mezclar.
   */
  interface NodeStyleServer {
    listen(...args: never[]): unknown;
    address(): { port?: number | null | undefined } | string | null;
  }

  /**
   * Forma "simplified" y RECOMENDADA: recibe el servidor y llama a `listen()`
   * ella misma si hace falta, asi que no hay carrera entre el listen manual y la
   * primera peticion del isolate. Es la que usa src/worker.ts.
   */
  export function httpServerHandler(server: NodeStyleServer): WorkerEntrypointLike;
  /** Forma por puerto: exige `server.listen(port)` a mano. Ver src/worker.ts. */
  export function httpServerHandler(options: { port: number }): WorkerEntrypointLike;
}
