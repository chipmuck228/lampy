export type TransmissionStatus =
  | 'created'
  | 'sent'
  | 'received'
  | 'declined'
  | 'expired'
  | 'revoked'

export type Transmission = {
  id: string
  sourceMomentId: string
  sourceRevision: number
  senderId: string
  recipientId?: string
  status: TransmissionStatus
  message?: string
  createdAt: string
  sentAt?: string
  receivedAt?: string
  legacy?: boolean
  legacySource?: string
}
