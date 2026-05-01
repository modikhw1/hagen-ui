"use client"
import * as React from "react"

export class ErrorBoundary extends React.Component<{ children: React.ReactNode, fallback?: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback || <div className="p-4 border border-red-500 bg-red-50 text-red-700">Något gick fel.</div>;
    return this.props.children;
  }
}
