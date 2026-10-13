const MAX_PIPS = 12;

export default function Seats({ capacity, left }) {
  const taken = capacity - left;
  const pips = Math.min(capacity, MAX_PIPS);
  const label = left <= 0 ? 'Full' : left === 1 ? '1 seat left' : `${left} seats left`;

  return (
    <span className="seats" aria-label={label}>
      <span className="pips" aria-hidden="true">
        {Array.from({ length: pips }, (_, i) => (
          <i key={i} className={capacity <= MAX_PIPS && i < taken ? 'pip taken' : 'pip'} />
        ))}
      </span>
      <span className={left <= 0 ? 'seats-label full' : 'seats-label'}>{label}</span>
    </span>
  );
}
