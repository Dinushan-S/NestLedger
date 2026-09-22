import type { Session } from "@supabase/supabase-js";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Image,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";

import { receiptApi } from "../../lib/nestledger";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme-context";
import ModernButton from "../ui/ModernButton";
import { BottomSheet } from "../ui/BottomSheet";
import type {
	ParsedReceipt,
	ReceiptItemDraft,
} from "./receiptParser";

type Props = {
	currency: string;
	onClose: () => void;
	onConfirm: (receipt: ParsedReceipt) => void;
	session?: Session | null;
	visible: boolean;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const parseInputNumber = (value: string) => {
	const parsed = Number(value.replace(/,/g, "").trim());
	return Number.isFinite(parsed) ? parsed : 0;
};

const messageForError = (error: unknown) =>
	error instanceof Error
		? error.message
		: "We could not read that receipt. Try a brighter, flatter photo.";

async function optimizeAndGetBase64(uri: string): Promise<{ base64: string; uri: string }> {
	try {
		const manipulated = await ImageManipulator.manipulateAsync(
			uri,
			[{ resize: { width: 1024 } }],
			{
				compress: 0.7,
				format: ImageManipulator.SaveFormat.JPEG,
				base64: true,
			},
		);
		if (manipulated.base64) {
			return { base64: manipulated.base64, uri: manipulated.uri };
		}
	} catch (manipError) {
		console.warn("Image downscaling failed, falling back to raw read:", manipError);
	}

	// Fallback to reading raw image if manipulator failed
	const res = await fetch(uri);
	const blob = await res.blob();
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const dataUrl = typeof reader.result === "string" ? reader.result : "";
			const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
			resolve({ base64: base64 || "", uri });
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

export function ReceiptScannerSheet({ currency, onClose, onConfirm, session, visible }: Props) {
	const { theme } = useTheme();
	const [imageUri, setImageUri] = useState<string | null>(null);
	const [parsedReceipt, setParsedReceipt] = useState<ParsedReceipt | null>(null);
	const [items, setItems] = useState<ReceiptItemDraft[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showReview, setShowReview] = useState(false);

	useEffect(() => {
		if (!visible) return;
		setImageUri(null);
		setParsedReceipt(null);
		setItems([]);
		setBusy(false);
		setError(null);
		setShowReview(false);
	}, [visible]);

	const processImage = useCallback(
		async (
			rawUri: string,
			mimeType: string = "image/jpeg",
		) => {
			setImageUri(rawUri);
			setBusy(true);
			setError(null);
			try {
				const activeSession = session ?? (await supabase.auth.getSession()).data.session;
				if (!activeSession) {
					throw new Error("You must be logged in to scan a receipt.");
				}
				const optimized = await optimizeAndGetBase64(rawUri);
				setImageUri(optimized.uri);

				const nextReceipt = await receiptApi.extractReceipt(
					activeSession,
					optimized.base64,
					mimeType,
				);
				setParsedReceipt(nextReceipt);
				setItems(nextReceipt.items);
				setShowReview(true);
			} catch (extractError) {
				setError(messageForError(extractError));
				setShowReview(false);
			} finally {
				setBusy(false);
			}
		},
		[session],
	);

	const capture = async (source: "camera" | "library") => {
		setError(null);
		try {
			if (source === "camera") {
				const permission = await ImagePicker.requestCameraPermissionsAsync();
				if (!permission.granted) {
					setError("Camera access is required to scan a bill. Enable it in Settings and try again.");
					return;
				}
			}
			const pickerOptions: ImagePicker.ImagePickerOptions = {
				allowsEditing: false,
				mediaTypes: ["images"],
				quality: 0.8,
			};
			const result =
				source === "camera"
					? await ImagePicker.launchCameraAsync(pickerOptions)
					: await ImagePicker.launchImageLibraryAsync(pickerOptions);
			if (result.canceled) return;
			const asset = result.assets?.[0];
			if (!asset?.uri) {
				setError("No image was returned. Try taking the photo again.");
				return;
			}
			await processImage(asset.uri, asset.mimeType ?? "image/jpeg");
		} catch (captureError) {
			setError(messageForError(captureError));
		}
	};

	useEffect(() => {
		if (!visible) return;
		// Android can recreate the activity while the system camera is open. Expo
		// exposes the completed picker result so the scan is not silently lost.
		void ImagePicker.getPendingResultAsync().then((result: any) => {
			if (!result || !("canceled" in result) || result.canceled) return;
			const asset = result.assets?.[0];
			if (asset?.uri) {
				void processImage(asset.uri, asset.mimeType ?? "image/jpeg");
			}
		});
	}, [visible, processImage]);

	const editedTotal = useMemo(
		() => roundMoney(items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0)),
		[items],
	);

	const updateItem = (
		index: number,
		field: "name" | "quantity" | "unitPrice" | "totalPrice",
		value: string,
	) => {
		setItems((current) =>
			current.map((item, itemIndex) => {
				if (itemIndex !== index) return item;
				if (field === "name") return { ...item, name: value };
				const numericValue = parseInputNumber(value);
				if (field === "quantity") {
					return {
						...item,
						quantity: numericValue,
						totalPrice: roundMoney(numericValue * item.unitPrice),
					};
				}
				if (field === "unitPrice") {
					return {
						...item,
						unitPrice: numericValue,
						totalPrice: roundMoney(numericValue * item.quantity),
					};
				}
				return {
					...item,
					totalPrice: numericValue,
					unitPrice: item.quantity > 0 ? roundMoney(numericValue / item.quantity) : numericValue,
				};
			}),
		);
	};

	const addItem = () => {
		setItems((current) => [
			...current,
			{
				confidence: "low",
				id: `receipt-item-manual-${current.length + 1}`,
				name: "",
				quantity: 1,
				rawText: "",
				totalPrice: 0,
				unitPrice: 0,
			},
		]);
	};

	const removeItem = (index: number) => {
		setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
	};

	const confirm = () => {
		if (!parsedReceipt) return;
		const validItems = items
			.filter(
				(item) =>
					item.name.trim().length > 0 &&
					Number.isFinite(item.quantity) &&
					item.quantity > 0 &&
					Number.isFinite(item.totalPrice) &&
					item.totalPrice > 0,
			)
			.map((item) => ({
				...item,
				name: item.name.trim(),
				quantity: roundMoney(item.quantity),
				unitPrice: roundMoney(item.unitPrice),
				totalPrice: roundMoney(item.totalPrice),
			}));
		if (!validItems.length) {
			setError("Add at least one item with a positive line total.");
			return;
		}
		onConfirm({
			...parsedReceipt,
			items: validItems,
			total: roundMoney(validItems.reduce((sum, item) => sum + item.totalPrice, 0)),
		});
	};

	const resetToCapture = () => {
		setImageUri(null);
		setParsedReceipt(null);
		setItems([]);
		setError(null);
		setShowReview(false);
	};

	return (
		<BottomSheet onClose={onClose}>
			<Text style={[styles.title, { color: theme.text }]}>Scan a bill</Text>
			<Text style={[styles.subtitle, { color: theme.textMuted }]}>Take a clear photo and we will fill the items, quantities, and prices for you. You can edit every field before saving.</Text>

			{imageUri ? (
				<Image accessibilityLabel="Receipt photo" source={{ uri: imageUri }} style={styles.preview} />
			) : null}

			{busy ? (
				<View style={styles.busyState}>
					<ActivityIndicator color={theme.primary} size="large" />
					<Text style={[styles.busyText, { color: theme.text }]}>Reading receipt…</Text>
					<Text style={[styles.helpText, { color: theme.textMuted }]}>This can take a few seconds on the first scan.</Text>
				</View>
			) : showReview && parsedReceipt ? (
				<>
					<View style={[styles.reviewHeader, { borderColor: theme.border }]}>
						<View style={styles.reviewHeaderCopy}>
							<Text style={[styles.sectionTitle, { color: theme.text }]}>Check the scan</Text>
							<Text style={[styles.helpText, { color: theme.textMuted }]}>
								{parsedReceipt.vendor ?? "Unknown store"}
								{parsedReceipt.date ? ` · ${parsedReceipt.date}` : ""}
							</Text>
						</View>
						<Text style={[styles.total, { color: theme.primary }]}>{currency} {editedTotal.toFixed(2)}</Text>
					</View>

					{parsedReceipt.warnings.length ? (
						<View style={[styles.warningBox, { backgroundColor: theme.secondarySoft, borderColor: theme.secondary }]}>
							<Text style={[styles.warningTitle, { color: theme.text }]}>Review before saving</Text>
							{parsedReceipt.warnings.map((warning) => (
								<Text key={warning} style={[styles.warningText, { color: theme.textMuted }]}>• {warning}</Text>
							))}
						</View>
					) : null}

					<View style={styles.itemsHeader}>
						<Text style={[styles.sectionTitle, { color: theme.text }]}>Items</Text>
						<Pressable accessibilityRole="button" onPress={addItem} testID="receipt-add-item">
							<Text style={[styles.link, { color: theme.primary }]}>+ Add item</Text>
						</Pressable>
					</View>

					{items.map((item, index) => (
						<View key={item.id} style={[styles.itemCard, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}>
							<View style={styles.itemTitleRow}>
								<Text style={[styles.itemNumber, { color: theme.textMuted }]}>Item {index + 1}</Text>
								{items.length > 1 ? (
									<Pressable accessibilityRole="button" accessibilityLabel={`Remove item ${index + 1}`} onPress={() => removeItem(index)} testID={`receipt-remove-item-${index}`}>
										<Text style={[styles.remove, { color: theme.danger }]}>Remove</Text>
									</Pressable>
								) : null}
							</View>
							<TextInput
								accessibilityLabel={`Item ${index + 1} name`}
								onChangeText={(value) => updateItem(index, "name", value)}
								placeholder="Item name"
								placeholderTextColor={theme.textMuted}
								style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
								testID={`receipt-item-name-${index}`}
								value={item.name}
							/>
							<View style={styles.numberRow}>
								<View style={styles.numberField}>
									<Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Qty</Text>
									<TextInput
										keyboardType="decimal-pad"
										onChangeText={(value) => updateItem(index, "quantity", value)}
										placeholder="1"
										placeholderTextColor={theme.textMuted}
										style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
										testID={`receipt-item-quantity-${index}`}
										value={String(item.quantity || "")}
									/>
								</View>
								<View style={styles.numberField}>
									<Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Unit price</Text>
									<TextInput
										keyboardType="decimal-pad"
										onChangeText={(value) => updateItem(index, "unitPrice", value)}
										placeholder="0.00"
										placeholderTextColor={theme.textMuted}
										style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
										testID={`receipt-item-unit-price-${index}`}
										value={String(item.unitPrice || "")}
									/>
								</View>
								<View style={styles.numberField}>
									<Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Line total</Text>
									<TextInput
										keyboardType="decimal-pad"
										onChangeText={(value) => updateItem(index, "totalPrice", value)}
										placeholder="0.00"
										placeholderTextColor={theme.textMuted}
										style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
										testID={`receipt-item-total-${index}`}
										value={String(item.totalPrice || "")}
									/>
								</View>
							</View>
							<Text style={[styles.confidence, { color: item.confidence === "high" ? theme.success : theme.warning }]}>
								{item.confidence === "high" ? "Clear match" : "Please verify this row"}
							</Text>
						</View>
					))}

					<View style={styles.buttonRow}>
						<ModernButton icon={<Text>↻</Text>} onPress={resetToCapture} secondary testID="receipt-retake" text="Retake" />
						<ModernButton disabled={!items.some((item) => item.name.trim() && item.totalPrice > 0)} icon={<Text>✓</Text>} onPress={confirm} testID="receipt-use-scan" text="Use this scan" />
					</View>
				</>
			) : (
				<>
					<View style={[styles.captureCard, { backgroundColor: theme.primarySoft }]}>
						<Text style={styles.captureIcon}>▣</Text>
						<Text style={[styles.captureTitle, { color: theme.text }]}>Skip the typing</Text>
						<Text style={[styles.helpText, { color: theme.textMuted }]}>Keep the whole receipt in frame. Avoid glare, shadows, and folded corners.</Text>
					</View>
					<ModernButton icon={<Text>⌕</Text>} onPress={() => void capture("camera")} testID="receipt-take-photo" text="Take a photo" />
					<ModernButton icon={<Text>▧</Text>} onPress={() => void capture("library")} secondary testID="receipt-choose-photo" text="Choose from photos" />
					<Text style={[styles.privacy, { color: theme.textMuted }]}>The image is read on the device. Nothing is saved until you review and confirm the expense.</Text>
				</>
			)}

			{error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
			{showReview ? (
				<Pressable accessibilityRole="button" onPress={onClose} style={styles.cancelButton} testID="receipt-cancel">
					<Text style={[styles.link, { color: theme.textMuted }]}>Cancel</Text>
				</Pressable>
			) : null}
		</BottomSheet>
	);
}

const styles = StyleSheet.create({
	title: { fontSize: 24, fontWeight: "800" },
	subtitle: { fontSize: 14, lineHeight: 20 },
	preview: { borderRadius: 16, height: 150, marginTop: 2, width: "100%" },
	captureCard: { alignItems: "center", borderRadius: 18, gap: 8, padding: 20 },
	captureIcon: { fontSize: 34 },
	captureTitle: { fontSize: 18, fontWeight: "800" },
	busyState: { alignItems: "center", gap: 8, paddingVertical: 30 },
	busyText: { fontSize: 16, fontWeight: "700" },
	helpText: { fontSize: 13, lineHeight: 18 },
	privacy: { fontSize: 12, lineHeight: 17, textAlign: "center" },
	reviewHeader: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingBottom: 12 },
	reviewHeaderCopy: { flex: 1, gap: 3 },
	sectionTitle: { fontSize: 16, fontWeight: "800" },
	total: { fontSize: 18, fontWeight: "800" },
	warningBox: { borderRadius: 12, borderWidth: 1, gap: 3, padding: 12 },
	warningTitle: { fontSize: 13, fontWeight: "800" },
	warningText: { fontSize: 12, lineHeight: 17 },
	itemsHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
	link: { fontSize: 14, fontWeight: "700" },
	itemCard: { borderRadius: 14, borderWidth: 1, gap: 8, padding: 12 },
	itemTitleRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
	itemNumber: { fontSize: 12, fontWeight: "700" },
	remove: { fontSize: 12, fontWeight: "700" },
	input: { borderRadius: 10, borderWidth: 1, fontSize: 15, minHeight: 44, paddingHorizontal: 10, paddingVertical: 8 },
	numberRow: { flexDirection: "row", gap: 8 },
	numberField: { flex: 1, gap: 3 },
	fieldLabel: { fontSize: 11, fontWeight: "600" },
	confidence: { fontSize: 11, fontWeight: "700" },
	buttonRow: { flexDirection: "row", gap: 10 },
	error: { fontSize: 13, lineHeight: 18 },
	cancelButton: { alignItems: "center", minHeight: 42, justifyContent: "center" },
});
