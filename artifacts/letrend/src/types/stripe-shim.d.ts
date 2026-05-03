// Stub to silence stripe import errors in client build
declare module 'stripe' {
  const Stripe: any;
  export = Stripe;
}
