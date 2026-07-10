import Link from "next/link";
import {
  PRIVACY_COMPANY_ADDRESS,
  PRIVACY_COMPANY_ALIASES,
  PRIVACY_COMPANY_NAME,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_CONTACT_PHONE,
  PRIVACY_EFFECTIVE_DATE,
  privacyMailto,
} from "@/lib/privacy-policy";
import { SITE_PRODUCT_NAME } from "@/lib/site";
import Section from "@/components/content/Section";

export default function PrivacyPolicyBody() {
  return (
    <>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Aviso sobre datos publicados en emergencias</p>
        <p className="mt-1 leading-relaxed">
          {SITE_PRODUCT_NAME} es una aplicación de ayuda humanitaria. La
          información que usted publique voluntariamente (reportes, personas
          desaparecidas, fotos, ubicación) puede ser{" "}
          <strong>visible públicamente</strong> para coordinar rescate y
          reunificación familiar. Revise esta política y nuestros{" "}
          <Link
            href="/terminos"
            className="font-semibold underline hover:text-amber-950"
          >
            Términos y Condiciones
          </Link>{" "}
          antes de enviar datos.
        </p>
      </div>

      <Section id="introduccion" title="Política de Privacidad">
        <p>
          Esta Política de Privacidad (&quot;Política&quot;) aplica a{" "}
          <strong>{SITE_PRODUCT_NAME}</strong> y a{" "}
          <strong>{PRIVACY_COMPANY_NAME}</strong> (&quot;la Compañía&quot;) y
          regula la recopilación y el uso de datos. Salvo que se indique lo
          contrario, todas las referencias a la Compañía incluyen{" "}
          {PRIVACY_COMPANY_ALIASES}. La aplicación de la Compañía es una
          aplicación de ayuda humanitaria. Al usar la aplicación, usted
          acepta las prácticas de datos descritas en esta declaración.
        </p>
        <p className="text-sm text-slate-500">
          Vigente desde el {PRIVACY_EFFECTIVE_DATE}.
        </p>
      </Section>

      <Section
        id="ccpa"
        title="Ley de Privacidad del Consumidor de California (CCPA) y Ley de Derechos de Privacidad de California (CPRA)"
      >
        <p>
          Si usted es residente de California, tiene los siguientes derechos
          bajo la CCPA y la CPRA:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Derecho a saber:</strong> puede solicitar detalles sobre
            qué datos personales recopilamos, usamos y compartimos.
          </li>
          <li>
            <strong>Derecho a eliminar:</strong> puede solicitar la eliminación
            de datos personales, sujeto a ciertas excepciones legales.
          </li>
          <li>
            <strong>Derecho a corregir:</strong> puede solicitar correcciones de
            información personal inexacta.
          </li>
          <li>
            <strong>Derecho a excluirse:</strong> puede optar por no participar
            en la venta o compartición de datos personales con fines
            publicitarios.
          </li>
          <li>
            <strong>Derecho a restringir el uso de datos sensibles:</strong>{" "}
            puede limitar el uso de información personal sensible.
          </li>
          <li>
            <strong>Derecho contra represalias:</strong> la Compañía no
            discriminará contra usted por ejercer sus derechos.
          </li>
        </ul>
      </Section>

      <Section id="recopilacion" title="Recopilación de su información personal">
        <p>
          Para prestarle mejor los productos y servicios ofrecidos, la
          Compañía puede recopilar información personal identificable, como:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Nombre y apellido</li>
          <li>Dirección postal</li>
          <li>Correo electrónico</li>
          <li>Número de teléfono</li>
          <li>
            Ubicación, imágenes, datos biométricos, información de salud,
            contenido gráfico o sensible, imágenes de menores, direcciones IP,
            proximidad y geovallas
          </li>
          <li>Edad</li>
          <li>Género</li>
          <li>Raza</li>
          <li>Tipo de sangre</li>
        </ul>
        <p>
          La Compañía también puede recopilar información demográfica anónima,
          que no es única para usted, como edad y género.{" "}
          <strong>
            No recopilamos información personal sobre usted a menos que la
            proporcione voluntariamente.
          </strong>
        </p>
        <p>
          No obstante, puede ser necesario que proporcione cierta información
          personal cuando elija usar determinados productos o servicios, por
          ejemplo: (a) registrarse para una cuenta; (b) participar en un
          sorteo o concurso patrocinado por nosotros o un socio; (c) suscribirse
          a ofertas especiales de terceros seleccionados; (d) enviarnos un
          correo electrónico; (e) enviar información de pago al ordenar
          productos o servicios. Usaremos su información para comunicarnos con
          usted en relación con servicios y/o productos que haya solicitado, y
          podemos recopilar información personal o no personal adicional en el
          futuro.
        </p>
      </Section>

      <Section id="uso" title="Uso de su información personal">
        <p>
          La Compañía recopila y usa su información personal de las siguientes
          maneras:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Operar y prestar los servicios que usted ha solicitado.</li>
          <li>
            Proporcionarle información, productos o servicios que nos solicite.
          </li>
          <li>Enviarle avisos sobre su cuenta.</li>
          <li>
            Cumplir las obligaciones de la Compañía y hacer valer nuestros
            derechos derivados de cualquier contrato entre usted y nosotros,
            incluida la facturación y el cobro.
          </li>
          <li>
            Notificarle cambios en {SITE_PRODUCT_NAME} o en productos o
            servicios que ofrecemos o prestamos a través de ella.
          </li>
          <li>Cualquier otro propósito con su consentimiento.</li>
        </ul>
        <p>
          La Compañía también puede usar su información personal identificable
          para informarle sobre otros productos o servicios disponibles de la
          Compañía y sus afiliados.
        </p>
      </Section>

      <Section id="terceros" title="Compartición de información con terceros">
        <p>
          La Compañía no vende, alquila ni cede sus listas de clientes a
          terceros.
        </p>
        <p>
          La Compañía puede compartir datos con socios de confianza para
          realizar análisis estadísticos, enviarle correo postal o
          electrónico, brindar soporte al cliente o coordinar entregas. Todos
          esos terceros tienen prohibido usar su información personal excepto
          para prestar estos servicios a la Compañía, y están obligados a
          mantener la confidencialidad de su información.
        </p>
        <p>
          La Compañía puede divulgar su información personal, sin previo aviso,
          si la ley lo exige o si de buena fe considera que dicha acción es
          necesaria para: (a) cumplir con la ley o un proceso legal; (b)
          proteger y defender los derechos o la propiedad de la Compañía;
          y/o (c) actuar en circunstancias urgentes para proteger la seguridad
          personal de los usuarios de la Compañía o del público.
        </p>
      </Section>

      <Section id="derechos" title="Derecho a la eliminación">
        <p>
          Sujeto a ciertas excepciones, al recibir una solicitud verificable de
          su parte, nosotros:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Eliminaremos su información personal de nuestros registros; y
          </li>
          <li>
            Indicaremos a los proveedores de servicios que eliminen su
            información personal de sus registros.
          </li>
        </ul>
        <p>
          Bajo la CCPA y la CPRA, usted tiene derecho a solicitar que la
          Compañía, y cualquier tercero con quien se haya vendido o compartido
          su información personal, elimine cualquier dato personal recopilado
          sobre usted. Para ejercer sus derechos, contáctenos en{" "}
          <a
            href={privacyMailto("Ejercicio de derechos de privacidad")}
            className="font-semibold text-sky-700 hover:underline"
          >
            {PRIVACY_CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          Tenga en cuenta que es posible que no podamos cumplir solicitudes de
          eliminación si es necesario para:
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Completar la transacción para la cual se recopiló la información,
            cumplir los términos de una garantía escrita o un retiro de
            producto conforme a la ley federal, y prestar un bien o servicio
            solicitado por usted, o razonablemente anticipado en el contexto
            de nuestra relación comercial, o cumplir un contrato entre usted y
            nosotros;
          </li>
          <li>
            Detectar incidentes de seguridad, proteger contra actividad
            maliciosa, engañosa, fraudulenta o ilegal, o enjuiciar a quienes
            sean responsables;
          </li>
          <li>
            Depurar para identificar y reparar errores que afecten la
            funcionalidad prevista;
          </li>
          <li>
            Ejercer la libertad de expresión, garantizar el derecho de otro
            consumidor a ejercer su libertad de expresión, o ejercer otro
            derecho previsto por la ley;
          </li>
          <li>
            Cumplir con la Ley de Privacidad de Comunicaciones Electrónicas de
            California;
          </li>
          <li>
            Realizar investigación científica, histórica o estadística de
            interés público que cumpla con la ética y las leyes de privacidad
            aplicables, cuando la eliminación haga imposible o perjudique
            gravemente el logro de dicha investigación, siempre que hayamos
            obtenido su consentimiento informado;
          </li>
          <li>
            Permitir usos internos razonablemente alineados con sus
            expectativas según su relación con nosotros;
          </li>
          <li>Cumplir una obligación legal existente; o</li>
          <li>
            Usar de otro modo su información personal, internamente, de forma
            lícita y compatible con el contexto en que la proporcionó.
          </li>
        </ul>
      </Section>

      <Section id="menores" title="Menores de trece años">
        <p>
          La Compañía sigue los principios de la Ley de Protección de la
          Privacidad Infantil en Línea (COPPA), el Reglamento General de
          Protección de Datos (RGPD) y cualquier otra ley local sobre
          recopilación de datos de menores. Cualquier cuenta o suscripción
          creada para usuarios que se sepa son menores involucrará
          notificación y/o consentimiento parental.
        </p>
        <p>
          La Compañía recopila información personal identificable de menores de
          trece años cuando un adulto responsable la proporciona
          voluntariamente en el contexto de la aplicación humanitaria.
        </p>
      </Section>

      <Section id="correo" title="Comunicaciones por correo electrónico">
        <p>
          Ocasionalmente, la Compañía puede contactarlo por correo electrónico
          para anuncios, ofertas promocionales, alertas, confirmaciones,
          encuestas y/u otras comunicaciones generales.
        </p>
      </Section>

      <Section id="almacenamiento" title="Sitios externos de almacenamiento de datos">
        <p>
          Podemos almacenar sus datos en servidores proporcionados por
          proveedores de alojamiento externos con los que tenemos contrato.
        </p>
      </Section>

      <Section id="cambios" title="Cambios a esta declaración">
        <p>
          La Compañía se reserva el derecho de modificar esta Política de
          tiempo en tiempo, por ejemplo cuando cambien nuestros servicios,
          nuestras prácticas de protección de datos o la ley. Cuando los
          cambios sean significativos, se lo informaremos mediante aviso por
          correo electrónico a la dirección principal de su cuenta, un aviso
          destacado en nuestro sitio y/o la actualización de la información de
          privacidad. El uso continuado de la aplicación y/o los servicios
          disponibles tras dichas modificaciones constituirá: (a) su
          reconocimiento de la Política modificada; y (b) su acuerdo de
          cumplirla y quedar obligado por ella.
        </p>
      </Section>

      <Section id="contacto" title="Información de contacto">
        <p>
          La Compañía recibe con agrado sus preguntas o comentarios sobre esta
          Política. Si cree que la Compañía no ha cumplido esta Política,
          contáctenos en:
        </p>
        <p className="pl-2 leading-relaxed">
          <strong>{PRIVACY_COMPANY_NAME}</strong>
          <br />
          {PRIVACY_COMPANY_ADDRESS}
          <br />
          Correo:{" "}
          <a
            href={privacyMailto()}
            className="font-semibold text-sky-700 hover:underline"
          >
            {PRIVACY_CONTACT_EMAIL}
          </a>
          <br />
          Teléfono:{" "}
          <a
            href={`tel:${PRIVACY_CONTACT_PHONE}`}
            className="font-semibold text-sky-700 hover:underline"
          >
            {PRIVACY_CONTACT_PHONE}
          </a>
        </p>
      </Section>
    </>
  );
}
