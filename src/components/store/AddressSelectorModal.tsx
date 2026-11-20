import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  CheckCircle2,
  Factory,
  LocateFixed,
  MapPin,
  Navigation,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  DELIVERY_SERVICE_AREA_NOTE,
  MANUFACTURING_ORIGIN,
  validateDeliveryAddress,
  validateTamilNaduDeliveryEligibility,
} from '../../lib/domainLogic';
import { apiRequest, ApiError } from '../../utils/api';
import type { DeliveryAddress } from '../../types';

interface AddressSelectorModalProps {
  mapsApiKey: string;
  addresses: DeliveryAddress[];
  selectedAddressId: string | null;
  defaultRecipientName: string;
  actionLabel?: string;
  onSaveAddress: (draft: {
    id?: string;
    label: string;
    recipientName: string;
    contactPhone: string;
    formattedAddress: string;
    streetDetails?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    landmark?: string;
    lat?: number;
    lng?: number;
    placeId?: string;
  }) => Promise<DeliveryAddress>;
  onDeleteAddress: (id: string) => Promise<void>;
  onConfirmAddress: (address: DeliveryAddress) => Promise<void> | void;
  onClose: () => void;
}

interface GeocodeProxyResponse {
  found: boolean;
  lat?: number;
  lng?: number;
  formattedAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  placeId?: string;
  validTamilNadu?: boolean;
  serviceabilityError?: string;
  zeroResults?: boolean;
  geocodeUnavailable?: boolean;
  quotaExceeded?: boolean;
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const upper = msg.toUpperCase();
  return (
    upper.includes('OVER_QUERY_LIMIT') ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('QUOTA') ||
    upper.includes('429')
  );
}

// Default center anchored on Coimbatore manufacturing hub in Tamil Nadu
const COIMBATORE_FACTORY_CENTER = { lat: 11.0168, lng: 76.9558 };

const MapViewportSync: React.FC<{
  center: { lat: number; lng: number };
  zoomLevel: number;
}> = ({ center, zoomLevel }) => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.panTo(center);
    map.setZoom(zoomLevel);
  }, [map, center, zoomLevel]);
  return null;
};

interface PlacesAutocompleteFieldProps {
  onPlacePicked: (picked: {
    formattedAddress: string;
    city?: string;
    state?: string;
    postalCode?: string;
    lat?: number;
    lng?: number;
    placeId?: string;
  }) => void;
}

const PlacesAutocompleteField: React.FC<PlacesAutocompleteFieldProps> = ({
  onPlacePicked,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const placesLibrary = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLibrary || !containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = '';

    const autocompleteEl = new placesLibrary.PlaceAutocompleteElement({
      includedPrimaryTypes: ['street_address', 'premise', 'sublocality', 'locality', 'geocode'],
      includedRegionCodes: ['in'],
    });
    autocompleteEl.style.width = '100%';
    autocompleteEl.style.display = 'block';
    autocompleteEl.style.colorScheme = 'light';

    const handleSelect = async (event: Event) => {
      try {
        interface PlaceLike {
          id?: string;
          formattedAddress?: string;
          displayName?: string | { text?: string };
          location?: { lat: () => number; lng: () => number };
          addressComponents?: Array<{
            types: string[];
            longText?: string;
            shortText?: string;
          }>;
          fetchFields: (opts: { fields: string[] }) => Promise<void>;
        }
        const customEvt = event as unknown as {
          placePrediction?: { toPlace: () => PlaceLike };
          place?: PlaceLike;
        };
        const place = customEvt.placePrediction
          ? customEvt.placePrediction.toPlace()
          : customEvt.place;
        if (!place) return;

        await place.fetchFields({
          fields: ['location', 'viewport', 'displayName', 'formattedAddress', 'addressComponents'],
        });

        const formattedAddress =
          place.formattedAddress ||
          (typeof place.displayName === 'string' ? place.displayName : '') ||
          '';

        let city = '';
        let state = '';
        let postalCode = '';
        if (Array.isArray(place.addressComponents)) {
          for (const comp of place.addressComponents) {
            if (comp.types.includes('locality') || comp.types.includes('administrative_area_level_2')) {
              if (!city) city = comp.longText || comp.shortText || '';
            }
            if (comp.types.includes('administrative_area_level_1')) {
              state = comp.longText || comp.shortText || '';
            }
            if (comp.types.includes('postal_code')) {
              postalCode = comp.longText || comp.shortText || '';
            }
          }
        }

        const lat = place.location ? place.location.lat() : undefined;
        const lng = place.location ? place.location.lng() : undefined;

        onPlacePicked({
          formattedAddress,
          city,
          state,
          postalCode,
          lat,
          lng,
          placeId: place.id,
        });
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    };

    autocompleteEl.addEventListener('gmp-select', handleSelect);
    container.appendChild(autocompleteEl);

    return () => {
      autocompleteEl.removeEventListener('gmp-select', handleSelect);
      container.innerHTML = '';
    };
  }, [placesLibrary, onPlacePicked]);

  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-slate-700">
        Search Address with Google Maps Places (Tamil Nadu)
      </label>
      <div
        ref={containerRef}
        data-testid="gmp-place-autocomplete-host"
        className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-2 py-1"
      />
    </div>
  );
};

export const AddressSelectorModal: React.FC<AddressSelectorModalProps> = ({
  mapsApiKey,
  addresses,
  selectedAddressId,
  defaultRecipientName,
  actionLabel = 'Confirm Address & Proceed to Bill',
  onSaveAddress,
  onDeleteAddress,
  onConfirmAddress,
  onClose,
}) => {
  const [activeId, setActiveId] = useState<string | null>(
    selectedAddressId || addresses[0]?.id || null,
  );
  const [showNewForm, setShowNewForm] = useState<boolean>(addresses.length === 0);

  const [label, setLabel] = useState('Home');
  const [recipientName, setRecipientName] = useState(defaultRecipientName || '');
  const [contactPhone, setContactPhone] = useState('');
  const [formattedAddress, setFormattedAddress] = useState('');
  const [streetDetails, setStreetDetails] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('Tamil Nadu');
  const [postalCode, setPostalCode] = useState('');
  const [landmark, setLandmark] = useState('');
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);
  const [placeId, setPlaceId] = useState<string | undefined>(undefined);
  const [pinStatus, setPinStatus] = useState<'idle' | 'pinning' | 'pinned' | 'error'>('idle');
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const geocodeSeqRef = useRef(0);
  const skipNextAutoGeocodeRef = useRef(false);

  const activeAddress = addresses.find((a) => a.id === activeId) || null;
  const hasExplicitPin =
    (typeof lat === 'number' && typeof lng === 'number') ||
    (typeof activeAddress?.lat === 'number' && typeof activeAddress?.lng === 'number' && !showNewForm);

  const mapCenter =
    typeof lat === 'number' && typeof lng === 'number'
      ? { lat, lng }
      : activeAddress?.lat && activeAddress?.lng && !showNewForm
        ? { lat: activeAddress.lat, lng: activeAddress.lng }
        : COIMBATORE_FACTORY_CENTER;

  const pinPosition = mapCenter;
  const targetZoom = typeof lat === 'number' && typeof lng === 'number' ? 15 : hasExplicitPin ? 14 : 7;

  // Geocode typed address directly onto the Google Map pin via server-side proxy
  const geocodeAndPinAddress = useCallback(
    async (queryText: string, updateFormattedFromResult = false) => {
      const clean = queryText.trim();
      if (clean.length < 6) return;

      const seq = ++geocodeSeqRef.current;
      setPinStatus('pinning');
      setPinMessage('Locating and pinning address on Google Maps...');

      try {
        const res = await apiRequest<GeocodeProxyResponse>('/api/maps/geocode', {
          method: 'POST',
          body: JSON.stringify({ address: clean }),
        });
        if (seq !== geocodeSeqRef.current) return;

        if (res.quotaExceeded) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }

        if (res.found && typeof res.lat === 'number' && typeof res.lng === 'number') {
          setLat(res.lat);
          setLng(res.lng);
          if (res.placeId) setPlaceId(res.placeId);
          if (res.city && !city.trim()) setCity(res.city);
          if (res.state) setStateName(res.state);
          if (res.postalCode && !postalCode.trim()) setPostalCode(res.postalCode);
          if (updateFormattedFromResult && res.formattedAddress) {
            skipNextAutoGeocodeRef.current = true;
            setFormattedAddress(res.formattedAddress);
          }

          if (res.validTamilNadu === false) {
            setPinStatus('error');
            setPinMessage(
              res.serviceabilityError ||
                'Out of delivery zone. Delivery is available ONLY within Tamil Nadu.',
            );
            setError(
              res.serviceabilityError ||
                'Delivery is available ONLY within Tamil Nadu (projects manufactured at Coimbatore).',
            );
          } else {
            setPinStatus('pinned');
            setPinMessage(
              `Pinned on Map (${res.lat.toFixed(4)}, ${res.lng.toFixed(4)}) · Tamil Nadu Serviceable`,
            );
            setError(null);
          }
        } else if (res.zeroResults) {
          setPinStatus('error');
          setPinMessage(
            'Could not find this address on Google Maps. Check street/city spelling inside Tamil Nadu.',
          );
        } else {
          setPinStatus('idle');
          setPinMessage(null);
        }
      } catch (err) {
        if (seq !== geocodeSeqRef.current) return;
        if (err instanceof ApiError && err.status === 429) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setPinStatus('idle');
        setPinMessage(null);
      }
    },
    [city, postalCode],
  );

  // Debounced auto-pinning when user types street/city/pincode
  useEffect(() => {
    if (!showNewForm) return;
    if (skipNextAutoGeocodeRef.current) {
      skipNextAutoGeocodeRef.current = false;
      return;
    }

    const composed = [streetDetails.trim(), formattedAddress.trim(), city.trim(), postalCode.trim()]
      .filter(Boolean)
      .join(', ');
    if (composed.length < 8) return;

    const timer = window.setTimeout(() => {
      void geocodeAndPinAddress(composed, false);
    }, 650);

    return () => window.clearTimeout(timer);
  }, [showNewForm, formattedAddress, streetDetails, city, postalCode, geocodeAndPinAddress]);

  const handlePlacePicked = useCallback(
    (picked: {
      formattedAddress: string;
      city?: string;
      state?: string;
      postalCode?: string;
      lat?: number;
      lng?: number;
      placeId?: string;
    }) => {
      skipNextAutoGeocodeRef.current = true;
      setFormattedAddress(picked.formattedAddress);
      if (picked.city) setCity(picked.city);
      if (picked.state) setStateName(picked.state);
      if (picked.postalCode) setPostalCode(picked.postalCode);
      if (typeof picked.lat === 'number') setLat(picked.lat);
      if (typeof picked.lng === 'number') setLng(picked.lng);
      if (picked.placeId) setPlaceId(picked.placeId);
      setShowNewForm(true);

      const tnCheck = validateTamilNaduDeliveryEligibility({
        formattedAddress: picked.formattedAddress,
        city: picked.city,
        state: picked.state,
        postalCode: picked.postalCode,
      });

      if (!tnCheck.valid) {
        setPinStatus('error');
        setPinMessage(tnCheck.error || 'Deliverable ONLY within Tamil Nadu.');
        setError(tnCheck.error || 'Delivery is restricted to Tamil Nadu only.');
      } else {
        setPinStatus('pinned');
        setPinMessage(
          typeof picked.lat === 'number' && typeof picked.lng === 'number'
            ? `Pinned on Map (${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}) · Tamil Nadu Serviceable`
            : 'Pinned in Tamil Nadu · Serviceable',
        );
        setError(null);
      }
    },
    [],
  );

  const handleMapClick = async (clickedLat: number, clickedLng: number) => {
    setLat(clickedLat);
    setLng(clickedLng);
    setPinStatus('pinning');
    setPinMessage(`Pinning (${clickedLat.toFixed(4)}, ${clickedLng.toFixed(4)})...`);

    try {
      const res = await apiRequest<GeocodeProxyResponse>('/api/maps/geocode', {
        method: 'POST',
        body: JSON.stringify({ lat: clickedLat, lng: clickedLng }),
      });
      if (res.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      if (res.found) {
        skipNextAutoGeocodeRef.current = true;
        if (res.formattedAddress) setFormattedAddress(res.formattedAddress);
        if (res.city) setCity(res.city);
        if (res.state) setStateName(res.state);
        if (res.postalCode) setPostalCode(res.postalCode);
        if (res.placeId) setPlaceId(res.placeId);

        if (res.validTamilNadu === false) {
          setPinStatus('error');
          setPinMessage(
            res.serviceabilityError || 'Selected map pin is outside Tamil Nadu.',
          );
          setError(
            res.serviceabilityError ||
              'Delivery is available ONLY within Tamil Nadu (projects manufactured at Coimbatore).',
          );
        } else {
          setPinStatus('pinned');
          setPinMessage(
            `Pinned on Map (${clickedLat.toFixed(4)}, ${clickedLng.toFixed(4)}) · Tamil Nadu`,
          );
          setError(null);
        }
      } else {
        setPinStatus('pinned');
        setPinMessage(
          `Custom Map Pin (${clickedLat.toFixed(4)}, ${clickedLng.toFixed(4)})`,
        );
      }
    } catch {
      setPinStatus('pinned');
      setPinMessage(
        `Custom Map Pin (${clickedLat.toFixed(4)}, ${clickedLng.toFixed(4)})`,
      );
    }
  };

  const handleSaveNewAddress = async () => {
    setError(null);
    const fullLine = [streetDetails.trim(), formattedAddress.trim()]
      .filter(Boolean)
      .join(', ');
    const check = validateDeliveryAddress({
      label,
      recipientName,
      contactPhone,
      formattedAddress: fullLine || formattedAddress,
      streetDetails,
      city,
      state: stateName,
      postalCode,
      landmark,
      lat: lat ?? mapCenter.lat,
      lng: lng ?? mapCenter.lng,
      placeId,
    });
    if (!check.valid) {
      setError(check.error || 'Wrong or unserviceable address.');
      return null;
    }

    setSaving(true);
    try {
      const saved = await onSaveAddress(check.cleaned);
      setActiveId(saved.id);
      setShowNewForm(false);
      return saved;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save address.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    setError(null);
    let target = activeAddress;
    if (!target || showNewForm) {
      if (!target && !showNewForm) {
        setShowNewForm(true);
        setError('Please enter and select a valid Tamil Nadu delivery address first.');
        return;
      }
      if (showNewForm && (formattedAddress.trim() || streetDetails.trim() || !target)) {
        const saved = await handleSaveNewAddress();
        if (!saved) return;
        target = saved;
      }
    }

    if (!target) {
      setError('Please select a saved Tamil Nadu delivery address to proceed.');
      return;
    }

    // Re-validate saved address against Tamil Nadu restriction before proceeding to billing/payment
    const targetCheck = validateDeliveryAddress(target);
    if (!targetCheck.valid) {
      setError(
        targetCheck.error ||
          'Wrong or out-of-state address selected. Delivery is ONLY available within Tamil Nadu.',
      );
      return;
    }

    setConfirming(true);
    try {
      await onConfirmAddress(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm address.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-address-modal-title"
      data-testid="delivery-address-modal"
      className="fixed inset-0 z-50 bg-[#050F1E]/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-3xl bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-[#0B1F3A] text-white px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <MapPin className="w-5 h-5 text-[#F5C542]" />
            <div>
              <h3
                id="delivery-address-modal-title"
                className="font-display text-lg font-bold text-[#F5C542]"
              >
                Select Delivery Address Before Billing
              </h3>
              <p className="text-xs text-slate-300">
                {DELIVERY_SERVICE_AREA_NOTE}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close delivery address modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Coimbatore Manufacturing & Tamil Nadu Delivery Notice Banner */}
          <div
            data-testid="tn-delivery-policy-banner"
            className="rounded-xl bg-[#0B1F3A]/5 border border-[#D4AF37]/50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 text-[#0B1F3A] font-semibold">
              <Factory className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>
                Manufactured at <strong>{MANUFACTURING_ORIGIN}</strong> · Deliverable{' '}
                <strong>ONLY to Tamil Nadu</strong>
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-600">
              PIN Range: 600xxx – 643xxx
            </span>
          </div>

          {error && (
            <div
              role="alert"
              data-testid="address-validation-error"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Saved Addresses Selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-display font-bold uppercase tracking-wider text-slate-600">
                Saved Delivery Addresses ({addresses.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowNewForm((prev) => !prev);
                  setError(null);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0B1F3A]/5 hover:bg-[#0B1F3A]/10 text-[#0B1F3A] text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showNewForm ? 'Hide New Address Form' : 'Add New Address'}</span>
              </button>
            </div>

            {addresses.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                No saved Tamil Nadu delivery addresses yet. Enter your address below to pin it directly on Google Maps.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {addresses.map((addr) => {
                  const selected = addr.id === activeId && !showNewForm;
                  return (
                    <div
                      key={addr.id}
                      data-testid={`saved-address-card-${addr.id}`}
                      onClick={() => {
                        setActiveId(addr.id);
                        setShowNewForm(false);
                        setError(null);
                        if (typeof addr.lat === 'number' && typeof addr.lng === 'number') {
                          setLat(addr.lat);
                          setLng(addr.lng);
                        }
                      }}
                      className={`cursor-pointer rounded-xl border p-3.5 transition-all space-y-1.5 ${
                        selected
                          ? 'border-[#D4AF37] bg-amber-50/60 ring-2 ring-[#F5C542]/40'
                          : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2
                            className={`w-4 h-4 shrink-0 ${
                              selected ? 'text-[#0B1F3A]' : 'text-slate-300'
                            }`}
                          />
                          <span className="px-2 py-0.5 rounded bg-[#0B1F3A] text-[#F5C542] text-[10px] font-bold uppercase">
                            {addr.label}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {addr.recipientName}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label={`Delete saved address ${addr.label}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteAddress(addr.id);
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-700 leading-snug">
                        {addr.formattedAddress}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 text-[11px] font-mono text-slate-500">
                        <span>Tel: {addr.contactPhone}</span>
                        {typeof addr.lat === 'number' && typeof addr.lng === 'number' && (
                          <span>Pin: {addr.lat.toFixed(4)}, {addr.lng.toFixed(4)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Interactive Google Maps Picker & New Address Form */}
          {(showNewForm || addresses.length === 0) && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-display font-bold text-[#0B1F3A]">
                  <Navigation className="w-4 h-4 text-[#D4AF37]" />
                  <span>Enter Tamil Nadu Delivery Address &amp; Auto-Pin Map</span>
                </div>
                <div className="flex items-center gap-1">
                  {(['Home', 'Office', 'Workshop'] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLabel(preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        label === preset
                          ? 'bg-[#0B1F3A] text-[#F5C542]'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {mapsApiKey ? (
                <APIProvider apiKey={mapsApiKey}>
                  <div className="space-y-3">
                    <PlacesAutocompleteField onPlacePicked={handlePlacePicked} />

                    <div className="h-[230px] w-full rounded-xl overflow-hidden border border-slate-300 relative">
                      <GoogleMap
                        mapId="DEMO_MAP_ID"
                        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                        defaultCenter={mapCenter}
                        defaultZoom={targetZoom}
                        gestureHandling="greedy"
                        className="w-full h-full"
                        onClick={(ev) => {
                          const detailLatLng = ev.detail?.latLng;
                          if (detailLatLng) {
                            void handleMapClick(detailLatLng.lat, detailLatLng.lng);
                          }
                        }}
                      >
                        <MapViewportSync center={mapCenter} zoomLevel={targetZoom} />
                        <AdvancedMarker position={pinPosition}>
                          <Pin
                            background={pinStatus === 'error' ? '#DC2626' : '#F5C542'}
                            borderColor="#0B1F3A"
                            glyphColor="#0B1F3A"
                          />
                        </AdvancedMarker>
                      </GoogleMap>
                    </div>
                  </div>
                </APIProvider>
              ) : (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-900">
                  Interactive map preview activates automatically when Google Maps is loaded. Enter your Tamil Nadu street address below.
                </div>
              )}

              {pinMessage && (
                <div
                  data-testid="map-pin-status"
                  className={`rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-2 ${
                    pinStatus === 'error'
                      ? 'bg-red-50 border border-red-200 text-red-700'
                      : pinStatus === 'pinned'
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-blue-50 border border-blue-200 text-blue-800'
                  }`}
                >
                  <LocateFixed className="w-3.5 h-3.5 shrink-0" />
                  <span>{pinMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="addr-recipient"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Recipient Full Name *
                  </label>
                  <input
                    id="addr-recipient"
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Receiver full name"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="addr-phone"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    10-Digit Contact Phone Number *
                  </label>
                  <input
                    id="addr-phone"
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="e.g., 9876543210"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor="addr-formatted"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Door / Building / Street Address (Tamil Nadu Only) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const composed = [
                        streetDetails.trim(),
                        formattedAddress.trim(),
                        city.trim(),
                        stateName.trim(),
                        postalCode.trim(),
                      ]
                        .filter(Boolean)
                        .join(', ');
                      void geocodeAndPinAddress(composed, true);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B1F3A] hover:underline"
                  >
                    <LocateFixed className="w-3 h-3 text-[#D4AF37]" />
                    <span>Pin Address on Map</span>
                  </button>
                </div>
                <input
                  id="addr-formatted"
                  type="text"
                  value={formattedAddress}
                  onChange={(e) => {
                    setFormattedAddress(e.target.value);
                    setError(null);
                  }}
                  placeholder="House/Flat No, Street, Area (e.g., 42 Cross Cut Road, Gandhipuram, Coimbatore)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="addr-city"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    City / District (Tamil Nadu) *
                  </label>
                  <input
                    id="addr-city"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g., Coimbatore, Chennai, Madurai"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="addr-pincode"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    TN PIN Code *
                  </label>
                  <input
                    id="addr-pincode"
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="e.g., 641012"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="addr-landmark"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Landmark (Optional)
                  </label>
                  <input
                    id="addr-landmark"
                    type="text"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="Near bus stand / park..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {typeof lat === 'number' && typeof lng === 'number' ? (
                  <span className="text-[11px] font-mono text-emerald-700">
                    Pinned Coordinates: {lat.toFixed(4)}, {lng.toFixed(4)}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500">
                    Typing your address auto-pins the map location in Tamil Nadu
                  </span>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveNewAddress}
                  className="px-4 py-2 rounded-xl bg-[#0B1F3A] text-[#F5C542] text-xs font-bold hover:bg-[#16325C] disabled:opacity-60"
                >
                  {saving ? 'Validating & Saving...' : 'Save & Select Address'}
                </button>
              </div>
            </div>
          )}

          {/* Footer Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={confirming || saving}
              onClick={handleConfirm}
              data-testid="confirm-address-proceed-btn"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-sm font-bold shadow hover:brightness-105 disabled:opacity-60"
            >
              {confirming ? 'Generating Bill...' : actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
