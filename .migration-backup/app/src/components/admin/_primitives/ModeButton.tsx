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

const AdminModeButton = ({
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
        'rounded-md border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-accent/30',
        className,
      )}
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </button>
  );
};

export { AdminModeButton as ModeButton };
