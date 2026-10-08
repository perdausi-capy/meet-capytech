import { MapPin, MessageSquare, Phone, Video } from 'lucide-react';

type Kind = 'google_meet' | 'zoom' | 'phone' | 'in_person' | 'custom';

export function LocationIcon({ kind, className }: { kind?: Kind; className?: string }) {
  switch (kind) {
    case 'phone':
      return <Phone className={className} />;
    case 'in_person':
      return <MapPin className={className} />;
    case 'custom':
      return <MessageSquare className={className} />;
    default:
      return <Video className={className} />;
  }
}
