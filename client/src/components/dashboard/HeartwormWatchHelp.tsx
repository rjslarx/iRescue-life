import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HelpCircle } from "lucide-react";

interface HeartwormWatchHelpProps {
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

export function HeartwormWatchHelp({ align = "end", side = "bottom" }: HeartwormWatchHelpProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="How Heartworm Watch works"
          data-testid="button-heartworm-watch-help"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-muted-foreground hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className="w-[22rem] max-h-[28rem] overflow-y-auto p-4 space-y-3 text-sm"
        data-testid="popover-heartworm-watch-help"
      >
        <div>
          <p className="font-semibold leading-tight">How Heartworm Watch works</p>
          <p className="text-xs text-muted-foreground mt-1">
            A live roll-up of every heartworm treatment plan you've sent to an adopter, so you can
            spot missed appointments before they put a dog at risk.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What you're looking at
          </p>
          <p className="text-xs text-foreground mt-1">
            Each row is one heartworm-positive dog you adopted out, with the slow-kill or
            immiticide schedule you set up. Plans only appear here once you've used{" "}
            <span className="font-medium">Send to Adopter</span> — drafts stay hidden.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            The four status groups
          </p>
          <ul className="text-xs text-foreground mt-1 space-y-1">
            <li>
              <span className="font-medium text-destructive">Overdue</span> — at least one
              appointment is past due. Follow up with the adopter today.
            </li>
            <li>
              <span className="font-medium text-amber-700 dark:text-amber-400">Strict Rest</span> —
              the dog is inside the 30-day rest window after an immiticide injection. No vigorous
              exercise.
            </li>
            <li>
              <span className="font-medium">On Track</span> — appointments are scheduled and
              nothing is overdue.
            </li>
            <li>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Completed</span>
              {" "}— every appointment in the plan is confirmed done.
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            The two filters
          </p>
          <ul className="text-xs text-foreground mt-1 space-y-1">
            <li>
              <span className="font-medium">Overdue type</span> — narrows the Overdue group to a
              single appointment kind (Doxycycline, 1st Injection, 2nd/3rd Injection, Recheck, or
              Proheart). Other groups are unaffected.
            </li>
            <li>
              <span className="font-medium">Self-reported, not yet staff-verified</span> — shows
              only plans where the adopter ticked an appointment as done but staff hasn't
              confirmed it yet. Use this to triage what to verify next.
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Adding a plan
          </p>
          <ol className="text-xs text-foreground mt-1 space-y-0.5 list-decimal pl-4">
            <li>Open the dog's animal record.</li>
            <li>Open the <span className="font-medium">Heartworm Treatment</span> modal.</li>
            <li>Schedule the appointments and click <span className="font-medium">Send to Adopter</span>.</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-1">
            As soon as the plan is sent it shows up here — usually under On Track to start.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Working a row
          </p>
          <p className="text-xs text-foreground mt-1">
            Click any row to open the full plan. From there you can verify completions, view
            uploaded receipts, edit appointment dates, and re-send the schedule to the adopter.
          </p>
        </div>

        <div className="border-t pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            If the widget looks empty
          </p>
          <p className="text-xs text-foreground mt-1">
            Either no plans have been sent yet for your rescue, or your filters are excluding
            everything. Set <span className="font-medium">Overdue type</span> back to "Any
            appointment type" and turn the self-reported switch off to confirm.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
