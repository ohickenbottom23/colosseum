import Avatar, { Face } from "./Avatar";

// a row of overlapping faces, with "+3" when there are more than fit.
// ring is the color behind the stack, so each face gets an outline that matches it
export default function AvatarStack({
  faces,
  size = 28,
  max = 5,
  ring,
}: {
  faces: Face[];
  size?: number;
  max?: number;
  ring?: string;
}) {
  const shown = faces.slice(0, max);
  const extra = faces.length - shown.length;

  return (
    <span className="avatar-stack" style={ring ? ({ "--ring": ring } as React.CSSProperties) : undefined}>
      {shown.map((f) => (
        <Avatar key={f.uid} face={f} size={size} />
      ))}
      {extra > 0 && <span className="avatar-more">+{extra}</span>}
    </span>
  );
}
