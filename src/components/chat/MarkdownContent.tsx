import { isValidElement, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import "highlight.js/styles/github-dark.css";

function languageOf(children: ReactNode): string | undefined {
  if (!isValidElement(children)) return undefined;
  const className = (children.props as { className?: string }).className ?? "";
  return className.match(/language-([\w-]+)/)?.[1];
}

function CodeBlock(props: ComponentPropsWithoutRef<"pre">) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const language = languageOf(props.children);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preRef.current?.innerText ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-black/70">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5 text-xs text-slate-400">
        <span>{language ?? "code"}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre ref={preRef} {...props} className="overflow-x-auto p-4 text-[13px] leading-relaxed" />
    </div>
  );
}

const components: Components = {
  pre: CodeBlock,
  a: (props) => (
    <a {...props} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4" />
  ),
};

export function MarkdownContent({ text }: { text: string }) {
  return (
    <div
      className="break-words text-[15px] leading-[1.6] [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-xl [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-base [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_table]:my-3 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:border-line/15 [&_td]:px-3 [&_td]:py-1.5 [&_th]:border [&_th]:border-line/15 [&_th]:bg-panel/5 [&_th]:px-3 [&_th]:py-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-panel/10 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.9em]"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
