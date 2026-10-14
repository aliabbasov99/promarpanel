import { useEffect, useState } from 'react';
import { useNotify } from '../notify';
import {
  LuPlus, LuArchive, LuArrowLeftRight, LuTrash2,
} from 'react-icons/lu';

const ICONS = { created: LuPlus, archived: LuArchive, status: LuArrowLeftRight, deleted: LuTrash2 };
const TONE = { created: 'info', archived: 'success', status: 'info', deleted: 'danger' };

// Sağ altda görünən qısa bildirişlər
export function Toasts() {
  const { items } = useNotify();
  if (!items.length) return null;
  return (
    <div className="toast-wrap">
      {items.map((n) => {
        const Icon = ICONS[n.kind] || LuPlus;
        return (
          <div key={n.id} className={`toast ${TONE[n.kind] || 'info'}`}>
            <span className="toast-icon"><Icon size={16} /></span>
            <div className="toast-body">
              <div className="toast-title">{n.title}</div>
              <div className="toast-text">{n.body}</div>
              <div className="toast-time">{timeAgo(n.at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function timeAgo(iso) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'indi';
  if (s < 3600) return `${Math.floor(s / 60)} dəq əvvəl`;
  if (s < 86400) return `${Math.floor(s / 3600)} saat əvvəl`;
  return `${Math.floor(s / 86400)} gün əvvəl`;
}