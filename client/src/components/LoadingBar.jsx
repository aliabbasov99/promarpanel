// Məlumat serverdən gələnə qədər göstərilən animasiyalı yükləmə zolağı.
// Boş siyahı mesajı ("Məlumat yoxdur.") yalnız yükləmə bitdikdən sonra görünür.
export default function LoadingBar({ text = 'Yüklənir…' }) {
  return (
    <div className="loading-bar" role="status" aria-live="polite">
      <div className="loading-bar-track">
        <div className="loading-bar-ind" />
      </div>
      {text && <div className="loading-bar-text">{text}</div>}
    </div>
  );
}
