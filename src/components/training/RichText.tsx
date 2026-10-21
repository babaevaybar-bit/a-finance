import React from 'react';

function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part,
  );
}

/** Мини-рендер текста урока: «## », «- », «1. », «> », **жирный**, пустая строка — абзац */
export default function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((b, bi) => {
        const lines = b.split('\n');
        if (lines[0].startsWith('## ')) {
          const rest = lines.slice(1).join('\n');
          return (
            <React.Fragment key={bi}>
              <h3 className="text-base font-semibold pt-2">{lines[0].slice(3)}</h3>
              {rest && <RichText text={rest} />}
            </React.Fragment>
          );
        }
        if (lines.every(l => l.startsWith('> '))) {
          return (
            <blockquote key={bi} className="border-l-4 border-primary/60 bg-primary/5 rounded-r-lg px-4 py-2.5 italic">
              {lines.map((l, i) => <p key={i}>{inline(l.slice(2))}</p>)}
            </blockquote>
          );
        }
        if (lines.every(l => /^(- |\d+\. )/.test(l))) {
          const ordered = /^\d+\. /.test(lines[0]);
          const items = lines.map(l => l.replace(/^(- |\d+\. )/, ''));
          return ordered
            ? <ol key={bi} className="list-decimal pl-5 space-y-1">{items.map((t, i) => <li key={i}>{inline(t)}</li>)}</ol>
            : <ul key={bi} className="list-disc pl-5 space-y-1">{items.map((t, i) => <li key={i}>{inline(t)}</li>)}</ul>;
        }
        // смешанный блок: абзац + список
        const out: React.ReactNode[] = [];
        let list: string[] = [];
        const flush = () => { if (list.length) { out.push(<ul key={`l${out.length}`} className="list-disc pl-5 space-y-1">{list.map((t, i) => <li key={i}>{inline(t)}</li>)}</ul>); list = []; } };
        lines.forEach((l, i) => {
          if (l.startsWith('- ')) list.push(l.slice(2));
          else if (l.startsWith('> ')) { flush(); out.push(<blockquote key={i} className="border-l-4 border-primary/60 bg-primary/5 rounded-r-lg px-4 py-2.5 italic">{inline(l.slice(2))}</blockquote>); }
          else { flush(); out.push(<p key={i}>{inline(l)}</p>); }
        });
        flush();
        return <div key={bi} className="space-y-2">{out}</div>;
      })}
    </div>
  );
}
