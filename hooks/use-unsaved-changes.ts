'use client';

import { useEffect, useRef } from 'react';

const message =
  'Хадгалаагүй өөрчлөлт байна. Хуудаснаас гарвал эдгээр өөрчлөлт алга болно. Гарах уу?';

// Protect document unloads and in-app links. The Navigation API also lets
// supporting browsers cancel same-document back/forward without rewriting history.
export function useUnsavedChanges(hasPendingInput = false) {
  const dirty = useRef(false);
  const pending = useRef(hasPendingInput);
  useEffect(() => {
    pending.current = hasPendingInput;
  }, [hasPendingInput]);

  useEffect(() => {
    const isDirty = () => dirty.current || pending.current;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const click = (event: MouseEvent) => {
      if (
        !isDirty() ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.download ||
        (anchor.target && anchor.target !== '_self')
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      if (!['http:', 'https:'].includes(destination.protocol)) return;
      if (
        destination.origin === window.location.origin &&
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      )
        return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const navigate = (event: Event) => {
      const type = (event as Event & { navigationType?: string }).navigationType;
      if (type === 'traverse' && event.cancelable && isDirty() && !window.confirm(message))
        event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', click, true);
    navigation?.addEventListener('navigate', navigate);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', click, true);
      navigation?.removeEventListener('navigate', navigate);
    };
  }, []);

  return dirty;
}
