import { useState, type FormEvent } from "react";
import { Lock, MapPin, Play, Search } from "lucide-react";
import type { CreateResearchRequest } from "../types.ts";

const PRESETS: Array<{
  label: string;
  city: string;
  category: CreateResearchRequest["category"];
}> = [
  { label: "Galway cafés", city: "Galway, Ireland", category: "cafe" },
  { label: "Bath bakeries", city: "Bath, United Kingdom", category: "bakery" },
  { label: "Porto restaurants", city: "Porto, Portugal", category: "restaurant" },
];

const CATEGORY_OPTIONS: Array<{
  value: CreateResearchRequest["category"];
  label: string;
}> = [
  { value: "cafe", label: "Cafés" },
  { value: "restaurant", label: "Restaurants" },
  { value: "bakery", label: "Bakeries" },
];

export function AssignmentForm({
  onSubmit,
  busy,
}: {
  onSubmit: (input: CreateResearchRequest) => Promise<void>;
  busy: boolean;
}) {
  const [city, setCity] = useState("Galway, Ireland");
  const [category, setCategory] =
    useState<CreateResearchRequest["category"]>("cafe");
  const [count, setCount] = useState(3);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || city.trim().length < 2) return;
    void onSubmit({ city: city.trim(), category, count });
  };

  return (
    <form className="assignment" onSubmit={submit}>
      <div className="assignment-grid">
        <label className="field city-field">
          <span className="field-label">
            <MapPin size={13} aria-hidden="true" />
            Target market
          </span>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="City and country"
            maxLength={80}
            disabled={busy}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Prospect category</span>
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as CreateResearchRequest["category"])
            }
            disabled={busy}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="field-label">Prospects required</span>
          <div className="count-picker" role="group" aria-label="Prospect count">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={value === count ? "count-active" : ""}
                onClick={() => setCount(value)}
                disabled={busy}
                aria-pressed={value === count}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <button className="run-button" type="submit" disabled={busy}>
          {busy ? (
            <>
              <Search size={16} className="spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            <>
              <Play size={15} aria-hidden="true" />
              Assign to NOVA
            </>
          )}
        </button>
      </div>

      <div className="assignment-foot">
        <div className="presets" aria-label="Market presets">
          <span>Quick market:</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={busy}
              onClick={() => {
                setCity(preset.city);
                setCategory(preset.category);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="guardrail">
          <Lock size={12} aria-hidden="true" />
          Live public-data lookups only. No outreach, publishing, or spend.
        </p>
      </div>
    </form>
  );
}
