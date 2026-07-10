import Link from "next/link";
import type { Metadata } from "next";
import SubPageShell from "@/components/layout/SubPageShell";
import { pageMetadata } from "@/lib/metadata";
import { CONTACT_EMAIL, contactMailto, SITE_PRODUCT_NAME, SITE_URL } from "@/lib/site";
import Section from "@/components/content/Section";

export const metadata: Metadata = pageMetadata({
  title: "Términos y condiciones",
  description: `Condiciones de uso de la plataforma humanitaria ${SITE_PRODUCT_NAME}: reglas para publicar, moderación, contenido aceptable y limitación de responsabilidad.`,
  path: "/terminos",
});

const LAST_UPDATED = "28 de junio de 2026";

export default function TerminosPage() {
  return (
    <SubPageShell breadcrumb="Términos y condiciones" path="/terminos">
      <article className="e-legal-content mx-auto w-full max-w-3xl px-4 py-10 text-[var(--etext)] sm:px-6 sm:py-14">
      <h1 className="text-3xl font-black tracking-tight text-[var(--etext)] sm:text-4xl">
        Términos y Condiciones de Uso
      </h1>
      <p className="mt-2 text-sm text-[var(--etext2)]">
        Última actualización: {LAST_UPDATED}. Vigente desde su publicación.
      </p>

      <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <p className="font-semibold">
          Esta plataforma no sustituye a los servicios oficiales de
          emergencia.
        </p>
        <p className="mt-1 leading-relaxed">
          En caso de peligro inmediato llama al{" "}
          <a href="tel:171" className="font-bold underline">
            171
          </a>
          ,{" "}
          <a href="tel:911" className="font-bold underline">
            911
          </a>{" "}
          o a las autoridades competentes antes de publicar aquí.
        </p>
      </div>

      <Section id="aceptacion" title="1. Aceptación de los términos">
        <p>
          Al acceder, publicar contenido o utilizar de cualquier forma el
          sitio <strong>{SITE_URL.replace("https://", "")}</strong> (en adelante, la
          “Plataforma”), aceptas estos Términos y Condiciones (los
          “Términos”) y la{" "}
          <Link
            href="/privacidad"
            className="font-semibold text-sky-700 hover:underline"
          >
            Política de Privacidad
          </Link>{" "}
          que forma parte integral de los mismos. Si no estás de acuerdo
          con alguna disposición, abstente de utilizar la Plataforma.
        </p>
      </Section>

      <Section id="naturaleza" title="2. Naturaleza del servicio">
        <p>
          La Plataforma es una iniciativa ciudadana, sin fines de lucro,
          operada por personas voluntarias para coordinar respuesta
          humanitaria durante la emergencia. Sus
          funcionalidades principales incluyen:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Mapa colaborativo de emergencias, suministros, centros de
            acopio, edificaciones afectadas y antenas.
          </li>
          <li>
            Directorio público de personas desaparecidas y encontradas.
          </li>
          <li>
            Directorio de hospitales con necesidades de suministros y
            pacientes.
          </li>
          <li>
            Canales para ofrecer voluntariado, donaciones y contacto.
          </li>
        </ul>
        <p>
          La Plataforma se ofrece <strong>“tal cual”</strong> y{" "}
          <strong>“según disponibilidad”</strong>, sin garantías de
          continuidad, exhaustividad o exactitud de la información
          publicada por terceros.
        </p>
      </Section>

      <Section id="usuarios" title="3. Personas usuarias y registro">
        <p>
          El uso público de la Plataforma no requiere registro. Solo el
          personal administrativo del proyecto utiliza credenciales para
          tareas de moderación. La persona que publica un contenido es
          responsable de su veracidad y del cumplimiento de las reglas
          aquí descritas.
        </p>
      </Section>

      <Section
        id="consentimiento"
        title="4. Consentimiento expreso al publicar datos personales"
      >
        <p>
          Antes de publicar información que identifique a una tercera
          persona —especialmente reportes de personas desaparecidas o
          encontradas— declaras bajo tu responsabilidad que cuentas con
          autorización suficiente de un familiar, allegado o
          representante legal para hacerlo, y que comprendes que esos
          datos quedarán <strong>visibles públicamente</strong> en la
          Plataforma, indexables por motores de búsqueda y replicables por
          organizaciones aliadas con fines humanitarios.
        </p>
        <p>
          Cualquier persona afectada puede solicitar la retirada o
          rectificación de sus datos según se describe en la{" "}
          <Link
            href="/privacidad#derechos"
            className="font-semibold text-sky-700 hover:underline"
          >
            Política de Privacidad
          </Link>
          .
        </p>
      </Section>

      <Section id="uso-aceptable" title="5. Uso aceptable">
        <p>Te comprometes a:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Publicar únicamente información{" "}
            <strong>veraz, verificable y útil</strong> para la respuesta
            humanitaria.
          </li>
          <li>
            Limitarte al <strong>mínimo de datos necesarios</strong>: no
            incluir documentos de identidad, dirección domiciliaria
            exacta, datos médicos detallados, datos bancarios ni
            información que no sirva al objetivo de localización o ayuda.
          </li>
          <li>
            Tratar la información que veas en la Plataforma con
            confidencialidad y empatía. No reutilizarla para fines
            comerciales, publicitarios, políticos, religiosos ni de
            captación.
          </li>
          <li>
            Verificar la identidad de cualquier persona que te contacte
            antes de revelar información adicional sensible.
          </li>
          <li>
            Respetar las reglas de las personas voluntarias moderadoras y
            las indicaciones de las autoridades oficiales de emergencia.
          </li>
        </ul>
      </Section>

      <Section id="prohibido" title="6. Conductas y contenidos prohibidos">
        <p>Queda expresamente prohibido:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Publicar información falsa, engañosa, exagerada o fabricada
            (incluidos reportes de prueba en producción).
          </li>
          <li>
            Suplantar la identidad de otra persona, organización o
            autoridad.
          </li>
          <li>
            Publicar datos personales de terceros sin su consentimiento o
            sin un interés vital humanitario que lo justifique.
          </li>
          <li>
            Publicar contenido discriminatorio, violento, sexual,
            denigrante, difamatorio o que vulnere derechos fundamentales.
          </li>
          <li>
            Utilizar la Plataforma para spam, captación comercial,
            estafas, solicitudes de pago no autorizadas o ingeniería
            social.
          </li>
          <li>
            Atentar contra la seguridad de la Plataforma: ataques
            automatizados, scraping abusivo, evasión de límites,
            ingeniería inversa con fines maliciosos, o explotación de
            vulnerabilidades sin reporte responsable.
          </li>
          <li>
            Publicar contenido protegido por derechos de autor sin
            autorización del titular.
          </li>
          <li>
            Utilizar la Plataforma con fines de vigilancia, persecución,
            doxxing o cualquier propósito contrario a la dignidad de las
            personas afectadas.
          </li>
        </ul>
      </Section>

      <Section id="moderacion" title="7. Moderación y retirada de contenido">
        <p>
          El equipo del proyecto se reserva el derecho de moderar,
          ocultar, archivar o eliminar cualquier contenido que vulnere
          estos Términos, ponga en riesgo a personas afectadas o
          comprometa la operación de la Plataforma, sin necesidad de
          aviso previo. La moderación se ejerce con criterio humanitario
          y proporcional.
        </p>
        <p>
          Si detectas un contenido inapropiado, escríbenos a{" "}
          <a
            href={contactMailto("Reporte de abuso")}
            className="font-semibold text-sky-700 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
          . Atendemos las solicitudes de retirada de información personal
          con prioridad.
        </p>
      </Section>

      <Section id="contenido" title="8. Titularidad del contenido publicado">
        <p>
          Conservas la titularidad de la información que publicas. Al
          publicar otorgas a la Plataforma una licencia gratuita, no
          exclusiva y revocable para:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Alojar, mostrar, indexar y servir tu contenido en el sitio web
            y la API pública.
          </li>
          <li>
            Replicarlo en plataformas aliadas con las que el proyecto
            federe información (por ejemplo registros centralizados de
            personas desaparecidas), exclusivamente con fines humanitarios
            y sin contraprestación económica.
          </li>
          <li>
            Generar estadísticas agregadas y anónimas a partir de los
            datos publicados.
          </li>
        </ul>
        <p>
          La licencia termina automáticamente cuando solicitas la retirada
          de tu contenido o cuando el equipo lo retira por moderación.
        </p>
      </Section>

      <Section id="propiedad" title="9. Propiedad intelectual del proyecto">
        <p>
          El código fuente de la Plataforma es de código abierto y está
          disponible en el repositorio del proyecto, bajo la licencia
          indicada allí. El nombre, el
          logotipo y los elementos gráficos del proyecto pertenecen al
          equipo y se ceden únicamente para usos no comerciales coherentes
          con la misión humanitaria del proyecto.
        </p>
        <p>
          Los datos cartográficos provienen de{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sky-700 hover:underline"
          >
            OpenStreetMap
          </a>{" "}
          y están sujetos a su licencia ODbL.
        </p>
      </Section>

      <Section id="donaciones" title="10. Donaciones y transparencia">
        <p>
          Las donaciones recibidas por el proyecto se destinan
          exclusivamente a cubrir costos operativos (infraestructura,
          hosting, dominios y servicios externos imprescindibles) y se
          rinden de manera transparente al equipo voluntario. No
          constituyen un servicio comercial ni generan derecho a
          contraprestación. El proyecto no asume responsabilidades
          fiscales adicionales en nombre de las personas donantes.
        </p>
      </Section>

      <Section
        id="responsabilidad"
        title="11. Limitación de responsabilidad"
      >
        <p>En la máxima medida permitida por la ley aplicable:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            El equipo del proyecto <strong>no garantiza</strong> la
            exactitud, completitud, oportunidad ni utilidad para un fin
            específico de la información publicada por terceros.
          </li>
          <li>
            El equipo <strong>no se hace responsable</strong> por daños
            directos, indirectos, consecuenciales, lucro cesante,
            pérdidas reputacionales o cualquier perjuicio derivado del
            uso o la imposibilidad de uso de la Plataforma.
          </li>
          <li>
            La Plataforma puede experimentar interrupciones, fallos
            técnicos, pérdida o demora en la propagación de información
            durante la crisis. No hay acuerdo de nivel de servicio (SLA).
          </li>
          <li>
            En ningún caso la Plataforma reemplaza el contacto con
            servicios oficiales de emergencia, autoridades policiales,
            sanitarias o judiciales.
          </li>
        </ul>
      </Section>

      <Section id="indemnidad" title="12. Indemnidad">
        <p>
          Te comprometes a mantener indemne al equipo del proyecto,
          personas mantenedoras y colaboradoras frente a reclamaciones de
          terceros derivadas de tu uso indebido de la Plataforma, del
          incumplimiento de estos Términos o de la publicación de
          contenidos sin las autorizaciones necesarias.
        </p>
      </Section>

      <Section id="terceros" title="13. Servicios y enlaces de terceros">
        <p>
          La Plataforma puede incluir enlaces o integraciones con
          servicios de terceros (hosting, formularios, pasarelas de pago,
          redes sociales, plataformas aliadas, OpenStreetMap). El
          equipo no es responsable de sus contenidos ni de sus políticas
          de privacidad, que se rigen por sus propios términos.
        </p>
      </Section>

      <Section id="modificaciones" title="14. Modificaciones de los Términos">
        <p>
          Podemos actualizar estos Términos para reflejar cambios
          operativos, técnicos o legales. La versión vigente siempre es
          la publicada en esta URL con la fecha indicada al inicio. El
          uso continuado de la Plataforma tras la publicación de una
          nueva versión implica su aceptación.
        </p>
      </Section>

      <Section id="suspension" title="15. Suspensión del servicio">
        <p>
          El equipo puede suspender, restringir o discontinuar la
          Plataforma —total o parcialmente— sin necesidad de preaviso si
          lo considera necesario por motivos técnicos, de seguridad,
          legales o por terminación del despliegue humanitario.
        </p>
      </Section>

      <Section
        id="ley-aplicable"
        title="16. Ley aplicable y resolución de controversias"
      >
        <p>
          Estos Términos se rigen por las leyes de la jurisdicción en la que
          opera el equipo del proyecto, en lo que
          resulte aplicable a una iniciativa ciudadana sin fines de lucro.
          Las partes intentarán resolver de buena fe cualquier
          controversia mediante diálogo directo. De no ser posible, los
          tribunales competentes del domicilio del equipo del proyecto
          serán los facultados para conocer del asunto, salvo norma
          imperativa en contrario.
        </p>
      </Section>

      <Section id="contacto" title="17. Contacto">
        <p>
          Para cualquier asunto relacionado con estos Términos escríbenos
          a:
        </p>
        <p className="pl-2">
          ✉️{" "}
          <a
            href={contactMailto("Términos y condiciones")}
            className="font-semibold text-sky-700 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </Section>

      <p className="mt-10 text-xs text-slate-500">
        Consulta también nuestra{" "}
        <Link
          href="/privacidad"
          className="font-semibold text-sky-700 hover:underline"
        >
          Política de Privacidad
        </Link>
        .
      </p>
      </article>
    </SubPageShell>
  );
}
