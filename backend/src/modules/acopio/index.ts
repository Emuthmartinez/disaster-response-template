import { Router } from "express";
import { env } from "@/config/env";
import { buildAcopioRouter } from "./acopio-module";

/**
 * Módulo OFF por defecto (gating): sin ENABLE_RESPONSEGRID=true, este router
 * queda vacío (404) y NUNCA se construye el cliente ResponseGrid — server.ts
 * tampoco lo monta bajo /api/acopio en ese caso (ver src/server.ts).
 */
export const acopioRouter: Router = env.ENABLE_RESPONSEGRID
  ? buildAcopioRouter()
  : Router();
