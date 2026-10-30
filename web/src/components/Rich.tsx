import { Fragment } from "react";
import { Land } from "./GameLog";

/** Plain text with light markup: `**key action**` is bold and underlined, `[[Island]]` becomes the land's coloured chip. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|\[\[\w+\]\])/).map((part, i) => {
        if (part.startsWith("**")) return <strong key={i} className="font-bold underline decoration-2 underline-offset-2">{part.slice(2, -2)}</strong>;
        if (part.startsWith("[[")) return <Land key={i} type={part.slice(2, -2)} big />;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
