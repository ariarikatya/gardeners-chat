'use client';

import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    const role = typeof window !== 'undefined' ? localStorage.getItem('auth_role') : null;
    if (role === 'GARDENER') {
      window.location.replace('/chats');
    } else {
      window.location.replace('/login');
    }
  }, []);
  return null;
}
