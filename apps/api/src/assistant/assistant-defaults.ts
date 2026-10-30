export function defaultAssistantConfig(shopName: string) {
  return { enabled: true, tone: 'FRIENDLY' as const, voice: 'spruce',
    greetingVi: `Xin chào! Tôi có thể giúp gì cho bạn tại ${shopName}?`,
    greetingEn: `Hello! How can I help you at ${shopName}?` };
}
