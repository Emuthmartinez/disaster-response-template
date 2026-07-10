import { NextResponse, type NextRequest } from "next/server";

// El tier `api` (api.<dominio>) y el tier `web` corren el MISMO
// image de Next.js (un solo server.js sirve páginas + /api). En el host de la
// API NO queremos servir el frontend: es una superficie de API para terceros,
// no un sitio. Este middleware devuelve 404 a cualquier ruta que no sea /api/*
// cuando la petición llega por un host `api.*`.
//
// Se decide por el HOST de la request (no por el pod): ambos tiers son el mismo
// binario, así que la única señal fiable de "esto es la API" es el hostname.
// Cubre api.<dominio> (config/deployment.config.json → domains.api) y
// cualquier api.* de staging.
//
// Excepciones que SÍ pasan aunque no sean /api/*:
//   - /api/*        : la superficie real (incluye /api/readyz del health-check
//                     del LB y /api/docs · /api/openapi).
//   - /_next/*      : assets de Next (normalmente van a R2 vía assetPrefix, pero
//                     se permiten por si assetPrefix está vacío en algún entorno).
//   - /favicon.ico, /robots.txt : ruido inofensivo de navegadores/crawlers.

function isApiHost(host: string | null): boolean {
  if (!host) return false;
  // host puede venir con puerto (api.localhost:3000) → basta el prefijo.
  return host.startsWith("api.");
}

const ALLOWED_NON_API = ["/_next/", "/favicon.ico", "/robots.txt"];

export function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  if (!isApiHost(host)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.next();
  if (ALLOWED_NON_API.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Host de API + ruta de frontend → no existe aquí.
  return NextResponse.json(
    { error: "Not found. This host only serves the /api surface." },
    { status: 404 },
  );
}

// Solo corre el middleware donde puede importar. Excluimos los assets internos
// del matcher para no pagar el coste en cada chunk (y /_next ya está permitido
// arriba de todas formas). El gate real vive en la función.
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
