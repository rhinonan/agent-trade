"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  children: string;
  className?: string;
}

/**
 * Renders markdown text as styled HTML using react-markdown + GFM.
 * All elements are overridden with dark-theme Tailwind classes so no
 * @tailwindcss/typography dependency is needed.
 */
export function MarkdownContent({ children, className = "" }: MarkdownContentProps) {
  return (
    <div className={`prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: c }) => (
            <h3 className="text-zinc-200 text-base font-semibold mt-3 mb-1">{c}</h3>
          ),
          h2: ({ children: c }) => (
            <h4 className="text-zinc-200 text-sm font-semibold mt-2 mb-1">{c}</h4>
          ),
          h3: ({ children: c }) => (
            <h5 className="text-zinc-300 text-sm font-medium mt-2 mb-1">{c}</h5>
          ),
          p: ({ children: c }) => (
            <p className="text-zinc-300 text-sm leading-relaxed my-1">{c}</p>
          ),
          ul: ({ children: c }) => (
            <ul className="list-disc list-inside space-y-0.5 my-1">{c}</ul>
          ),
          ol: ({ children: c }) => (
            <ol className="list-decimal list-inside space-y-0.5 my-1">{c}</ol>
          ),
          li: ({ children: c }) => (
            <li className="text-zinc-400 text-sm">{c}</li>
          ),
          code: ({ className: codeClass, children: c }) => {
            const isInline = !codeClass;
            return isInline ? (
              <code className="bg-zinc-800 text-zinc-300 px-1 py-0.5 rounded text-xs">{c}</code>
            ) : (
              <pre className="bg-zinc-800/60 text-zinc-300 p-2 rounded text-xs overflow-x-auto my-1">
                <code>{c}</code>
              </pre>
            );
          },
          strong: ({ children: c }) => (
            <strong className="text-zinc-200 font-semibold">{c}</strong>
          ),
          em: ({ children: c }) => (
            <em className="text-zinc-300 italic">{c}</em>
          ),
          table: ({ children: c }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full text-xs border-collapse">{c}</table>
            </div>
          ),
          th: ({ children: c }) => (
            <th className="border border-zinc-700 px-2 py-1 text-zinc-300 bg-zinc-800/50">{c}</th>
          ),
          td: ({ children: c }) => (
            <td className="border border-zinc-700 px-2 py-1 text-zinc-400">{c}</td>
          ),
          a: ({ children: c, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              {c}
            </a>
          ),
          blockquote: ({ children: c }) => (
            <blockquote className="border-l-2 border-zinc-600 pl-3 my-2 text-zinc-500 italic">
              {c}
            </blockquote>
          ),
          hr: () => <hr className="border-zinc-700 my-2" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
