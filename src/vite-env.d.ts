/// <reference types="vite/client" />

import 'react';

declare global {
  interface HTMLVideoElement {
    referrerPolicy?: string;
  }
}

declare module 'react' {
  interface VideoHTMLAttributes<T> extends HTMLAttributes<T> {
    referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  }
}

