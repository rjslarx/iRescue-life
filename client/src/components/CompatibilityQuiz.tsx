import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, HelpCircle, RotateCcw, ShieldCheck } from "lucide-react";
import type { Animal } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Answers = {
  energy?: "low" | "moderate" | "high";
  pets?: "none" | "dogs" | "cats" | "both";
  kids?: "yes" | "no";
  training?: "yes" | "prefer-trained";
};

type QuizQuestion = {
  key: keyof Answers;
  prompt: string;
  helper: string;
  options: { value: string; label: string }[];
};

const questions: QuizQuestion[] = [
  {
    key: "energy",
    prompt: "What pace feels right at home?",
    helper: "Think about your usual week, not your most ambitious Saturday.",
    options: [
      { value: "low", label: "Calm and cozy" },
      { value: "moderate", label: "A balanced mix" },
      { value: "high", label: "Active and adventurous" },
    ],
  },
  {
    key: "pets",
    prompt: "Who already shares your home?",
    helper: "This helps flag introductions worth discussing with the rescue.",
    options: [
      { value: "none", label: "No dogs or cats" },
      { value: "dogs", label: "Dog(s)" },
      { value: "cats", label: "Cat(s)" },
      { value: "both", label: "Dogs and cats" },
    ],
  },
  {
    key: "kids",
    prompt: "Are children part of the household?",
    helper: "Choose yes even if children are present only part of the time.",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    key: "training",
    prompt: "How do you feel about continuing house-training?",
    helper: "Some animals need time and consistency while they settle into a new home.",
    options: [
      { value: "yes", label: "I’m ready to help" },
      { value: "prefer-trained", label: "I need an animal already house-trained" },
    ],
  },
];

function evaluate(animal: Animal, answers: Answers) {
  const matches: string[] = [];
  const conversations: string[] = [];
  const unknowns: string[] = [];

  if (animal.activityLevel) {
    if (answers.energy === animal.activityLevel) {
      matches.push(`Your preferred pace matches ${animal.name}'s ${animal.activityLevel} activity level.`);
    } else if (
      (answers.energy === "low" && animal.activityLevel === "high")
      || (answers.energy === "high" && animal.activityLevel === "low")
    ) {
      conversations.push(`Ask whether ${animal.name}'s ${animal.activityLevel} activity level fits your routine.`);
    } else {
      matches.push("Your activity preferences may be close enough to explore together.");
    }
  } else {
    unknowns.push(`The rescue can tell you more about ${animal.name}'s daily activity needs.`);
  }

  const hasDogs = answers.pets === "dogs" || answers.pets === "both";
  const hasCats = answers.pets === "cats" || answers.pets === "both";
  if (hasDogs) {
    if (animal.dogFriendly === true) matches.push(`${animal.name} is listed as dog-friendly.`);
    else if (animal.dogFriendly === false) conversations.push(`A home with dogs may not be the right fit for ${animal.name}.`);
    else unknowns.push(`Ask about introductions between ${animal.name} and resident dogs.`);
  }
  if (hasCats) {
    if (animal.catFriendly === true) matches.push(`${animal.name} is listed as cat-friendly.`);
    else if (animal.catFriendly === false) conversations.push(`A home with cats may not be the right fit for ${animal.name}.`);
    else unknowns.push(`Ask about introductions between ${animal.name} and resident cats.`);
  }
  if (answers.kids === "yes") {
    if (animal.childFriendly === true) matches.push(`${animal.name} is listed as friendly with children.`);
    else if (animal.childFriendly === false) conversations.push(`A home with children may not be the right fit for ${animal.name}.`);
    else unknowns.push(`Ask the rescue about ${animal.name}'s experience with children.`);
  }

  if (animal.houseTrained === true) {
    matches.push(`${animal.name} is currently listed as house-trained.`);
  } else if (animal.houseTrained === false && answers.training === "prefer-trained") {
    conversations.push(`${animal.name} may need continued house-training in a new home.`);
  } else if (animal.houseTrained === false && answers.training === "yes") {
    matches.push(`You are open to the continued house-training ${animal.name} may need.`);
  } else {
    unknowns.push(`Ask what house-training support ${animal.name} may need.`);
  }

  const heading = conversations.length > 1
    ? "Let’s find out a little more"
    : conversations.length === 1
      ? "This could be worth a conversation"
      : matches.length === 0
        ? "The rescue can help you decide"
        : unknowns.length > 0
          ? "There are promising signs—and a few questions"
          : "This looks like a strong start";

  return { heading, matches, conversations, unknowns };
}

export function CompatibilityQuiz({ animal, onApply }: { animal: Animal; onApply: () => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const hasAnsweredRef = useRef(false);
  const complete = step >= questions.length;
  const result = useMemo(() => evaluate(animal, answers), [animal, answers]);

  useEffect(() => {
    setStep(0);
    setAnswers({});
    hasAnsweredRef.current = false;
  }, [animal.id]);

  useEffect(() => {
    if (hasAnsweredRef.current) stepHeadingRef.current?.focus();
  }, [step]);

  const restart = () => {
    hasAnsweredRef.current = true;
    setStep(0);
    setAnswers({});
  };

  return (
    <section className="mt-7" aria-labelledby="compatibility-quiz-heading">
      <Card className="overflow-hidden rounded-[1.5rem] border-primary/20 bg-gradient-to-br from-card via-card to-primary/10 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Would we click?</p>
              <h2 id="compatibility-quiz-heading" className="mt-1 font-display text-3xl font-bold">See how life with {animal.name} might feel</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Four quick questions offer a starting point—not an adoption decision. The rescue always has the fullest picture.</p>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1">{complete ? "Complete" : `${step + 1} of ${questions.length}`}</Badge>
          </div>

          <Progress className="mt-5 h-2" value={complete ? 100 : ((step + 1) / questions.length) * 100} aria-label="Quiz progress" />

          {!complete ? (
            <div className="mt-7" aria-live="polite">
              <h3 ref={stepHeadingRef} tabIndex={-1} className="text-lg font-semibold outline-none">{questions[step].prompt}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{questions[step].helper}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {questions[step].options.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant="outline"
                    className="h-auto min-h-14 justify-between rounded-xl border-primary/20 bg-background/60 py-3 text-left transition-transform duration-200 hover:-translate-y-0.5 hover:bg-primary/5"
                    onClick={() => {
                      hasAnsweredRef.current = true;
                      setAnswers((current) => ({ ...current, [questions[step].key]: option.value }));
                      setStep((current) => current + 1);
                    }}
                  >
                    {option.label}<ChevronRight className="ml-3 h-4 w-4 shrink-0" />
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-7" aria-live="polite">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                <div><h3 ref={stepHeadingRef} tabIndex={-1} className="text-xl font-bold outline-none">{result.heading}</h3><p className="mt-1 text-sm text-muted-foreground">Here is what your answers suggest about meeting {animal.name}.</p></div>
              </div>
              {result.matches.length > 0 && (
                <div className="mt-5 space-y-2">
                  {result.matches.map((message) => <p key={message} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{message}</p>)}
                </div>
              )}
              {(result.conversations.length > 0 || result.unknowns.length > 0) && (
                <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
                  <p className="font-semibold">Good things to ask the rescue</p>
                  <div className="mt-2 space-y-2">
                    {[...result.conversations, ...result.unknowns].map((message) => <p key={message} className="flex gap-2 text-sm text-muted-foreground"><HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />{message}</p>)}
                  </div>
                </div>
              )}
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">This guide uses the profile information supplied by the rescue. It is not a guarantee of behavior, safety, or adoption approval.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                {animal.status === "available" && <Button type="button" onClick={onApply}>Apply to adopt {animal.name}</Button>}
                <Button type="button" variant="outline" onClick={restart}><RotateCcw className="h-4 w-4" />Retake quiz</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}