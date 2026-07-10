import { Fragment } from "react";

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Renderiza texto convirtiendo las URLs en enlaces clicables. Usa break-all en
 * los enlaces para que las URLs largas no desborden (p. ej. dentro de un popup). */
export default function LinkText({
  text,
  linkClassName = "text-sky-700",
}: {
  text: string;
  linkClassName?: string;
}) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`break-all underline ${linkClassName}`}
          >
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
