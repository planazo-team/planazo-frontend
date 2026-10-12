import { saludoMultiverso } from './fx/eggs';
import { SpiderArt } from './Icon';

/** Avatar con la inicial. Si el nombre es del multiverso arácnido, lleva máscara. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const aracnido = !!saludoMultiverso(name);
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: aracnido ? '#ff3b5c' : undefined }}
      title={name}
      aria-hidden
    >
      {aracnido ? <SpiderArt size={size} color="#0b0f0e" eyes="#fff" /> : name.trim()[0]?.toUpperCase()}
    </span>
  );
}
