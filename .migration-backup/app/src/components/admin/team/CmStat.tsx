export default function CmStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-right">
      <div className="text-sm font-semibold text-foreground">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
