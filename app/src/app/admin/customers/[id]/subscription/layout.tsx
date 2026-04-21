import type { ReactNode } from 'react';

export default function CustomerSubscriptionLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal?: ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
