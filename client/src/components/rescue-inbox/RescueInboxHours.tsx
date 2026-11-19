import { helpWeeklyHours } from "@shared/rescue-help";
import type { RescueHelpSettings } from "@/hooks/use-rescue-inbox";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const timeLabel = (hour: number) => hour === 24 ? "Midnight (end of day)" :
  hour === 12 ? "12:00 PM (noon)" : `${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`;

export function RescueInboxHours({ settings, onChange }: {
  settings: RescueHelpSettings;
  onChange: (changes: Partial<RescueHelpSettings>) => void;
}) {
  const hours = helpWeeklyHours(settings);
  function update(day: number, value: typeof hours[number]) {
    onChange({ weeklyHours: hours.map((h, i) => i === day ? value : h) });
  }
  return <div className="mt-5 space-y-4">
    <p className="ri-muted">Set each day separately. Closed days use your after-hours message. These hours do not change volunteer SMS quiet hours. Overnight hours are not supported.</p>
    {days.map((day, index) => {
      const h = hours[index];
      return <fieldset key={day} className="rounded-lg border p-3 min-w-0">
        <legend className="px-1 font-medium">{day}</legend>
        <label className="flex items-center gap-2 mb-3">
          <input type="checkbox" checked={!!h} onChange={e => update(index, e.target.checked ? {
            openHour: settings.openHour, closeHour: settings.closeHour,
          } : null)} />Open on {day}
        </label>
        {h ? <div className="ri-fields">
          <label className="ri-field"><span>{day} opens</span>
            <select value={h.openHour} onChange={e => update(index, { ...h, openHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{timeLabel(hour)}</option>)}
            </select>
          </label>
          <label className="ri-field"><span>{day} closes</span>
            <select value={h.closeHour} onChange={e => update(index, { ...h, closeHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map(hour => <option key={hour} value={hour}>{timeLabel(hour)}</option>)}
            </select>
          </label>
        </div> : <p className="ri-muted">Closed</p>}
      </fieldset>;
    })}
  </div>;
}
