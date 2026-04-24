type Props = {
  placeholder?: string;
};

export default function EmptyValue({ placeholder = '—' }: Props) {
  return <span aria-label="ej tillgängligt">{placeholder}</span>;
}
