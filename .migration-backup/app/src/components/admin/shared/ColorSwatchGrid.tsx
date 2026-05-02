'use client';

type Props = {
  value: string;
  colors: readonly string[];
  onChange: (color: string) => void;
  disabled?: boolean;
};

export function ColorSwatchGrid({
  value,
  colors,
  onChange,
  disabled = false,
}: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Färgval"
      className="flex flex-wrap gap-2"
      onKeyDown={(event) => {
        if (disabled || colors.length === 0) {
          return;
        }

        const currentIndex = Math.max(0, colors.indexOf(value));
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          onChange(colors[(currentIndex + 1) % colors.length] || colors[0] || value);
          return;
        }

        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          onChange(colors[(currentIndex - 1 + colors.length) % colors.length] || colors[0] || value);
          return;
        }

        if (event.key === 'Home') {
          event.preventDefault();
          onChange(colors[0] || value);
          return;
        }

        if (event.key === 'End') {
          event.preventDefault();
          onChange(colors[colors.length - 1] || value);
        }
      }}
    >
      {colors.map((item) => {
        const selected = item === value;
        return (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(item)}
            className={`h-8 w-8 rounded-full border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              selected ? 'border-primary ring-2 ring-primary/40' : 'border-transparent'
            }`}
            style={{ backgroundColor: item }}
          />
        );
      })}
    </div>
  );
}
