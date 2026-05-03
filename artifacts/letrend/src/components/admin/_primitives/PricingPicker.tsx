import { cn } from '@/lib/utils';

type Props = {
  active: boolean;
  onClick?: () => void;
  title: string;
  description: string;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
};

const AdminPricingPicker = ({
  active,
  onClick,
  title,
  description,
  className,
  disabled = false,
  type = 'button',
}: Props) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent/30',
        className,
      )}
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </button>
  );
};

export { AdminPricingPicker as PricingPicker };
