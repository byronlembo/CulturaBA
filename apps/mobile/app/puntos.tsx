import { ScrollView } from 'react-native';
import { PointsSection } from '@/features/points/PointsSection';
import { spacing, useColors } from '@/theme/tokens';

export default function Points() {
  const c = useColors();
  return (
    <ScrollView
      role="main"
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
    >
      <PointsSection />
    </ScrollView>
  );
}
