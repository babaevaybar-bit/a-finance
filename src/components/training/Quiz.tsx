import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, RotateCcw, Trophy } from 'lucide-react';
import type { Question } from '@/lib/trainingContent';
import { PASS_PERCENT } from '@/lib/trainingContent';

/** Перемешиваем варианты, чтобы правильный ответ не запоминали по позиции */
function shuffled(q: Question, seed: number) {
  const idx = q.options.map((_, i) => i);
  let s = seed + q.q.length * 7;
  for (let i = idx.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export default function Quiz({ questions, onSubmit }: { questions: Question[]; onSubmit: (score: number, total: number) => Promise<void> | void }) {
  const [attempt, setAttempt] = useState(1);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const orders = useMemo(() => questions.map((q, i) => shuffled(q, attempt * 31 + i)), [questions, attempt]);

  const score = questions.reduce((s, q, i) => s + (answers[i] === q.a ? 1 : 0), 0);
  const allAnswered = questions.every((_, i) => answers[i] !== undefined);
  const passed = score * 100 >= questions.length * PASS_PERCENT;

  async function check() {
    setChecked(true);
    await onSubmit(score, questions.length);
  }
  function retry() { setAnswers({}); setChecked(false); setAttempt(a => a + 1); }

  return (
    <div className="space-y-4">
      {questions.map((q, qi) => (
        <div key={qi} className="rounded-xl border p-4">
          <p className="text-sm font-medium"><span className="text-muted-foreground mr-1.5">{qi + 1}.</span>{q.q}</p>
          <div className="mt-3 grid gap-2">
            {orders[qi].map(oi => {
              const chosen = answers[qi] === oi;
              const right = oi === q.a;
              let cls = 'border-border hover:bg-muted/50';
              if (!checked && chosen) cls = 'border-primary bg-primary/5';
              if (checked && right) cls = 'border-emerald-500 bg-emerald-500/10';
              if (checked && chosen && !right) cls = 'border-destructive bg-destructive/10';
              return (
                <button key={oi} type="button" disabled={checked}
                  onClick={() => setAnswers(a => ({ ...a, [qi]: oi }))}
                  className={`text-left text-sm rounded-lg border px-3 py-2 transition-colors flex items-center gap-2 ${cls}`}>
                  <span className={`w-4 h-4 rounded-full border shrink-0 ${chosen ? 'border-[5px] border-primary' : ''}`} />
                  <span className="flex-1">{q.options[oi]}</span>
                  {checked && right && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}
                  {checked && chosen && !right && <XCircle size={16} className="text-destructive shrink-0" />}
                </button>
              );
            })}
          </div>
          {checked && q.why && <p className="mt-2 text-xs text-muted-foreground">💡 {q.why}</p>}
        </div>
      ))}

      {!checked ? (
        <Button onClick={check} disabled={!allAnswered} className="w-full sm:w-auto">
          {allAnswered ? 'Проверить' : `Ответьте на все вопросы (${Object.keys(answers).length}/${questions.length})`}
        </Button>
      ) : (
        <div className={`rounded-xl p-4 flex items-center gap-3 ${passed ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
          {passed ? <Trophy className="text-emerald-600 shrink-0" /> : <RotateCcw className="text-amber-600 shrink-0" />}
          <div className="flex-1">
            <p className="font-semibold">{score} из {questions.length} — {passed ? 'тест сдан!' : 'пока не сдан'}</p>
            <p className="text-xs text-muted-foreground">{passed ? 'Урок отмечен как пройденный.' : `Нужно не меньше ${PASS_PERCENT} %. Перечитайте урок и попробуйте ещё раз.`}</p>
          </div>
          <Button variant="outline" size="sm" onClick={retry}><RotateCcw size={14} className="mr-1.5" />Ещё раз</Button>
        </div>
      )}
    </div>
  );
}
