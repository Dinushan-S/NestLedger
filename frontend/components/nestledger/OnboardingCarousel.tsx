import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../../constants/nestledger';
import BentoCard from '../ui/BentoCard';
import ModernButton from '../ui/ModernButton';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type StepCard = {
  body: string;
  icon: IoniconName;
  iconBackgroundColor?: string;
  iconColor?: string;
  title: string;
};

type OnboardingStep = {
  body: string;
  cards: StepCard[];
  highlight: string;
  icon: IoniconName;
  kicker: string;
  title: string;
};

type Props = {
  onComplete: () => void;
  onSkip: () => void;
  primaryActionText: string;
};

const steps: OnboardingStep[] = [
  {
    body: 'NestLedger is built for shared home money. One space keeps your household budget, shopping, bills, savings, and updates together.',
    cards: [
      { body: 'See spend, activity, members, and reminders in one calm overview.', icon: 'grid-outline', title: 'Dashboard' },
      { body: 'Manage plans, bills, and savings in the same money hub.', icon: 'wallet-outline', title: 'Budget' },
      { body: 'Track household items together with live bought updates.', icon: 'cart-outline', title: 'Shopping' },
      { body: 'Invite members, switch spaces, and open settings from here.', icon: 'person-outline', title: 'Profile' },
    ],
    highlight: 'Next, you will create or choose your shared home space.',
    icon: 'home-outline',
    kicker: 'Welcome',
    title: 'Shared home budgeting without the chaos.',
  },
  {
    body: 'Start in Budget to create a plan, choose the total amount, set the date range, and record shared expenses against that plan.',
    cards: [
      { body: 'Create a budget plan for this month, a trip, or a family goal.', icon: 'add-circle-outline', iconBackgroundColor: theme.primarySoft, iconColor: theme.primary, title: 'Create a plan' },
      { body: 'Set the total amount and the dates that define the plan window.', icon: 'calendar-outline', iconBackgroundColor: theme.primarySoft, iconColor: theme.primary, title: 'Set the limits' },
      { body: 'Add expenses and watch Dashboard reflect spend and remaining money.', icon: 'stats-chart-outline', iconBackgroundColor: theme.primarySoft, iconColor: theme.primary, title: 'Track progress' },
    ],
    highlight: 'The Dashboard summary updates from the activity inside your active plan.',
    icon: 'wallet-outline',
    kicker: 'Budget Plans',
    title: 'Create a budget plan and track every shared spend.',
  },
  {
    body: 'Budget also holds your Bill Trackers and Savings Trackers, so routine household money stays in one place instead of scattered apps and notes.',
    cards: [
      { body: 'Bill Trackers help manage recurring payments and what is still pending.', icon: 'receipt-outline', title: 'Bills' },
      { body: 'Savings Trackers record deposits, withdrawals, and running balances.', icon: 'leaf-outline', iconBackgroundColor: theme.primarySoft, iconColor: theme.primary, title: 'Savings' },
      { body: 'Both live next to your budget plans so home planning stays connected.', icon: 'layers-outline', title: 'One money hub' },
    ],
    highlight: 'Use bills for recurring payments and savings for deposits or household goals.',
    icon: 'albums-outline',
    kicker: 'Bills And Savings',
    title: 'Track recurring bills and savings in the same space.',
  },
  {
    body: 'The shopping list is shared in real time. Everyone in the home space can add items, mark them bought, and see who updated what.',
    cards: [
      { body: 'Add products, quantities, and categories for the household list.', icon: 'add-outline', title: 'Add items' },
      { body: 'Mark something as bought and keep visible timestamps and member names.', icon: 'checkmark-circle-outline', title: 'Mark bought' },
      { body: 'Shopping activity connects back to spending habits and household visibility.', icon: 'sync-outline', title: 'Stay in sync' },
    ],
    highlight: 'Shopping stays live for everyone, so the same item is not bought twice.',
    icon: 'basket-outline',
    kicker: 'Shopping Together',
    title: 'Keep the home shopping list live for every member.',
  },
  {
    body: 'From Profile, you can invite another person by email or by shareable link. Once they sign in and accept, they join the same home space.',
    cards: [
      { body: 'Send an invite email or copy a link from the Invite action in Profile.', icon: 'mail-open-outline', title: 'Invite' },
      { body: 'Accepted invites add that person to your shared home space automatically.', icon: 'people-outline', title: 'Join the space' },
      { body: 'Members, notifications, and shared data update in real time for everyone.', icon: 'notifications-outline', title: 'See updates' },
    ],
    highlight: 'Invited members see the same household space, shared data, and member updates after they accept.',
    icon: 'person-add-outline',
    kicker: 'Invites And Updates',
    title: 'Bring other people into the same home and stay in sync.',
  },
];

export default function OnboardingCarousel({ onComplete, onSkip, primaryActionText }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView | null>(null);

  const slideWidth = useMemo(() => Math.max(width - 40, 280), [width]);
  const isLastStep = activeIndex === steps.length - 1;

  const goToIndex = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), steps.length - 1);
    scrollRef.current?.scrollTo({ animated: true, x: nextIndex * slideWidth, y: 0 });
    setActiveIndex(nextIndex);
  };

  return (
    <SafeAreaView style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>NestLedger</Text>
            <Text style={styles.stepText}>{`Step ${activeIndex + 1} of ${steps.length}`}</Text>
          </View>
          <Pressable hitSlop={10} onPress={onSkip} testID="onboarding-skip">
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
            setActiveIndex(nextIndex);
          }}
          pagingEnabled
          ref={scrollRef}
          showsHorizontalScrollIndicator={false}
          style={styles.carousel}
          testID="onboarding-carousel"
        >
          {steps.map((step, index) => (
            <View key={step.title} style={[styles.slide, { width: slideWidth }]}>
              <ScrollView
                contentContainerStyle={styles.slideContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <BentoCard tone="highlight" style={styles.heroCard}>
                  <View style={styles.heroIconWrap}>
                    <Ionicons color={theme.primary} name={step.icon} size={28} />
                  </View>
                  <Text style={styles.kicker}>{step.kicker}</Text>
                  <Text style={styles.title}>{step.title}</Text>
                  <Text style={styles.body}>{step.body}</Text>
                  <View style={styles.highlightCard}>
                    <Ionicons color={theme.secondary} name="sparkles-outline" size={18} />
                    <Text style={styles.highlightText}>{step.highlight}</Text>
                  </View>
                </BentoCard>

                <View style={styles.cardGrid}>
                  {step.cards.map((card) => (
                    <BentoCard key={`${step.title}-${card.title}`} style={[styles.detailCard, step.cards.length === 4 ? styles.halfCard : styles.fullCard]}>
                      <View style={[styles.detailIconWrap, card.iconBackgroundColor ? { backgroundColor: card.iconBackgroundColor } : null]}>
                        <Ionicons color={card.iconColor ?? theme.primary} name={card.icon} size={20} />
                      </View>
                      <Text style={styles.detailTitle}>{card.title}</Text>
                      <Text style={styles.detailBody}>{card.body}</Text>
                    </BentoCard>
                  ))}
                </View>

                {index === steps.length - 1 ? (
                  <BentoCard style={styles.footerNote}>
                    <Text style={styles.footerNoteTitle}>What happens after an invite?</Text>
                    <Text style={styles.footerNoteBody}>
                      The invited person signs in, accepts the invite, joins the same home space, and then sees the shared members, plans, shopping activity, and notifications.
                    </Text>
                  </BentoCard>
                ) : null}
              </ScrollView>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dotsRow}>
            {steps.map((step, index) => (
              <Pressable
                key={step.title}
                hitSlop={10}
                onPress={() => goToIndex(index)}
                style={[styles.dot, index === activeIndex && styles.dotActive]}
                testID={`onboarding-dot-${index}`}
              />
            ))}
          </View>

          <View style={styles.actionsRow}>
            {activeIndex > 0 ? (
              <Pressable hitSlop={10} onPress={() => goToIndex(activeIndex - 1)} testID="onboarding-back">
                <Text style={styles.backText}>Back</Text>
              </Pressable>
            ) : (
              <View />
            )}

            <ModernButton
              onPress={() => {
                if (isLastStep) {
                  onComplete();
                  return;
                }
                goToIndex(activeIndex + 1);
              }}
              testID={isLastStep ? 'onboarding-complete' : 'onboarding-next'}
              text={isLastStep ? primaryActionText : 'Next'}
            />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backText: {
    color: theme.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  brand: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  carousel: {
    flex: 1,
  },
  detailBody: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  detailCard: {
    gap: 8,
    minHeight: 138,
  },
  detailIconWrap: {
    alignItems: 'center',
    backgroundColor: theme.primarySoft,
    borderRadius: 16,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  detailTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  dot: {
    backgroundColor: theme.border,
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  dotActive: {
    backgroundColor: theme.primary,
    width: 28,
  },
  dotsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 18,
  },
  footer: {
    paddingBottom: 20,
    paddingTop: 12,
  },
  footerNote: {
    gap: 8,
  },
  footerNoteBody: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  footerNoteTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '700',
  },
  fullCard: {
    width: '100%',
  },
  halfCard: {
    width: '48%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroCard: {
    gap: 12,
    marginBottom: 14,
  },
  heroIconWrap: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  highlightCard: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  highlightText: {
    color: theme.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  kicker: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  screen: {
    backgroundColor: theme.background,
    flex: 1,
  },
  shell: {
    flex: 1,
    paddingHorizontal: 20,
  },
  skipText: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  slide: {
    flex: 1,
    paddingRight: 20,
  },
  slideContent: {
    gap: 14,
    paddingBottom: 20,
  },
  stepText: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  title: {
    color: theme.text,
    fontSize: 29,
    fontWeight: '800',
    lineHeight: 34,
  },
});
