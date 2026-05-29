import { useState, FormEvent } from 'react';

export interface InputReference {
  attestationId: string;
  quantityUsed: number;
  unit: string;
}

export interface AttestationFormData {
  productName: string;
  productId: string;
  location: string;
  materialCost: number;
  labourCost: number;
  outputQuantity: number;
  outputUnit: string;
  isTransformation: boolean;
  inputReferences: InputReference[];
}

interface FieldErrors {
  productName?: string;
  productId?: string;
  location?: string;
  materialCost?: string;
  labourCost?: string;
  outputQuantity?: string;
  outputUnit?: string;
  inputReferences?: { [index: number]: { attestationId?: string; quantityUsed?: string; unit?: string } };
}

const COUNTRY_CODES = [
  { code: 'AU', name: 'Australia' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CN', name: 'China' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IN', name: 'India' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'MX', name: 'Mexico' },
  { code: 'US', name: 'United States' },
];

interface AttestationFormProps {
  onSubmit: (data: AttestationFormData) => void;
  disabled?: boolean;
  resetKey?: number;
}

export function AttestationForm({ onSubmit, disabled = false, resetKey = 0 }: AttestationFormProps) {
  const [productName, setProductName] = useState('');
  const [productId, setProductId] = useState('');
  const [location, setLocation] = useState('');
  const [materialCost, setMaterialCost] = useState('');
  const [labourCost, setLabourCost] = useState('');
  const [outputQuantity, setOutputQuantity] = useState('');
  const [outputUnit, setOutputUnit] = useState('');
  const [isTransformation, setIsTransformation] = useState(false);
  const [inputReferences, setInputReferences] = useState<{ attestationId: string; quantityUsed: string; unit: string }[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [lastResetKey, setLastResetKey] = useState(resetKey);

  // Reset all fields when resetKey changes (after successful submission)
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setProductName('');
    setProductId('');
    setLocation('');
    setMaterialCost('');
    setLabourCost('');
    setOutputQuantity('');
    setOutputUnit('');
    setIsTransformation(false);
    setInputReferences([]);
    setErrors({});
  }

  function validate(): FieldErrors {
    const newErrors: FieldErrors = {};

    if (!productName.trim()) {
      newErrors.productName = 'Product name is required';
    }

    if (!productId.trim()) {
      newErrors.productId = 'Product ID is required';
    }

    if (!location) {
      newErrors.location = 'Location is required';
    }

    const matCost = parseFloat(materialCost);
    if (materialCost === '' || isNaN(matCost)) {
      newErrors.materialCost = 'Material cost is required';
    } else if (matCost < 0) {
      newErrors.materialCost = 'Material cost must be non-negative';
    }

    const labCost = parseFloat(labourCost);
    if (labourCost === '' || isNaN(labCost)) {
      newErrors.labourCost = 'Labour cost is required';
    } else if (labCost < 0) {
      newErrors.labourCost = 'Labour cost must be non-negative';
    }

    const outQty = parseFloat(outputQuantity);
    if (outputQuantity === '' || isNaN(outQty)) {
      newErrors.outputQuantity = 'Output quantity is required';
    } else if (outQty <= 0) {
      newErrors.outputQuantity = 'Output quantity must be greater than zero';
    }

    if (!outputUnit.trim()) {
      newErrors.outputUnit = 'Output unit is required';
    }

    const refErrors: FieldErrors['inputReferences'] = {};
    inputReferences.forEach((ref, index) => {
      const rowErrors: { attestationId?: string; quantityUsed?: string; unit?: string } = {};
      if (!ref.attestationId.trim()) {
        rowErrors.attestationId = 'Attestation ID is required';
      }
      const qty = parseFloat(ref.quantityUsed);
      if (ref.quantityUsed === '' || isNaN(qty)) {
        rowErrors.quantityUsed = 'Quantity is required';
      } else if (qty <= 0) {
        rowErrors.quantityUsed = 'Quantity must be greater than zero';
      }
      if (!ref.unit.trim()) {
        rowErrors.unit = 'Unit is required';
      }
      if (Object.keys(rowErrors).length > 0) {
        refErrors[index] = rowErrors;
      }
    });
    if (Object.keys(refErrors).length > 0) {
      newErrors.inputReferences = refErrors;
    }

    return newErrors;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    const formData: AttestationFormData = {
      productName: productName.trim(),
      productId: productId.trim(),
      location,
      materialCost: parseFloat(materialCost),
      labourCost: parseFloat(labourCost),
      outputQuantity: parseFloat(outputQuantity),
      outputUnit: outputUnit.trim(),
      isTransformation,
      inputReferences: inputReferences.map((ref) => ({
        attestationId: ref.attestationId.trim(),
        quantityUsed: parseFloat(ref.quantityUsed),
        unit: ref.unit.trim(),
      })),
    };

    onSubmit(formData);
  }

  function addInputReference() {
    setInputReferences([...inputReferences, { attestationId: '', quantityUsed: '', unit: '' }]);
  }

  function removeInputReference(index: number) {
    setInputReferences(inputReferences.filter((_, i) => i !== index));
    if (errors.inputReferences) {
      const newRefErrors = { ...errors.inputReferences };
      delete newRefErrors[index];
      setErrors({ ...errors, inputReferences: Object.keys(newRefErrors).length > 0 ? newRefErrors : undefined });
    }
  }

  function updateInputReference(index: number, field: 'attestationId' | 'quantityUsed' | 'unit', value: string) {
    const updated = [...inputReferences];
    updated[index] = { ...updated[index], [field]: value };
    setInputReferences(updated);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="form-group">
        <label className="form-label" htmlFor="productName">Product Name *</label>
        <input
          id="productName"
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          className={`form-input ${errors.productName ? 'error' : ''}`}
          disabled={disabled}
          placeholder="e.g., Maple Syrup Grade A"
        />
        {errors.productName && <div className="form-error">{errors.productName}</div>}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="productId">Product ID *</label>
        <input
          id="productId"
          type="text"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className={`form-input ${errors.productId ? 'error' : ''}`}
          disabled={disabled}
          placeholder="e.g., 550e8400-e29b-41d4-a716-446655440000"
        />
        {errors.productId && <div className="form-error">{errors.productId}</div>}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="location">Location *</label>
        <select
          id="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className={`form-input form-select ${errors.location ? 'error' : ''}`}
          disabled={disabled}
        >
          <option value="">Select country...</option>
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        {errors.location && <div className="form-error">{errors.location}</div>}
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="materialCost">Material Cost *</label>
          <input
            id="materialCost"
            type="number"
            min="0"
            step="0.01"
            value={materialCost}
            onChange={(e) => setMaterialCost(e.target.value)}
            className={`form-input ${errors.materialCost ? 'error' : ''}`}
            disabled={disabled}
            placeholder="0.00"
          />
          {errors.materialCost && <div className="form-error">{errors.materialCost}</div>}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="labourCost">Labour Cost *</label>
          <input
            id="labourCost"
            type="number"
            min="0"
            step="0.01"
            value={labourCost}
            onChange={(e) => setLabourCost(e.target.value)}
            className={`form-input ${errors.labourCost ? 'error' : ''}`}
            disabled={disabled}
            placeholder="0.00"
          />
          {errors.labourCost && <div className="form-error">{errors.labourCost}</div>}
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="outputQuantity">Output Quantity *</label>
          <input
            id="outputQuantity"
            type="number"
            min="0.01"
            step="0.01"
            value={outputQuantity}
            onChange={(e) => setOutputQuantity(e.target.value)}
            className={`form-input ${errors.outputQuantity ? 'error' : ''}`}
            disabled={disabled}
            placeholder="1"
          />
          {errors.outputQuantity && <div className="form-error">{errors.outputQuantity}</div>}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="outputUnit">Output Unit *</label>
          <input
            id="outputUnit"
            type="text"
            value={outputUnit}
            onChange={(e) => setOutputUnit(e.target.value)}
            className={`form-input ${errors.outputUnit ? 'error' : ''}`}
            disabled={disabled}
            placeholder="e.g., kg, L, units"
          />
          {errors.outputUnit && <div className="form-error">{errors.outputUnit}</div>}
        </div>
      </div>

      <div className="checkbox-group">
        <input
          id="isTransformation"
          type="checkbox"
          checked={isTransformation}
          onChange={(e) => setIsTransformation(e.target.checked)}
          disabled={disabled}
        />
        <label htmlFor="isTransformation">
          Is Transformation Step
        </label>
      </div>

      <div className="input-refs-section">
        <div className="input-refs-header">
          <h3 style={{ margin: 0 }}>Input References</h3>
          <button
            type="button"
            onClick={addInputReference}
            disabled={disabled}
            className="btn btn-success btn-sm"
          >
            + Add Input
          </button>
        </div>

        {inputReferences.length === 0 && (
          <p className="input-ref-empty">
            No input references. Click "Add Input" to reference upstream attestations.
          </p>
        )}

        {inputReferences.map((ref, index) => {
          const refError = errors.inputReferences?.[index];
          return (
            <div key={index} className="input-ref-row">
              <div>
                <input
                  type="text"
                  value={ref.attestationId}
                  onChange={(e) => updateInputReference(index, 'attestationId', e.target.value)}
                  className={`form-input ${refError?.attestationId ? 'error' : ''}`}
                  disabled={disabled}
                  placeholder="Attestation ID"
                  aria-label={`Input reference ${index + 1} attestation ID`}
                />
                {refError?.attestationId && <div className="form-error">{refError.attestationId}</div>}
              </div>
              <div>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={ref.quantityUsed}
                  onChange={(e) => updateInputReference(index, 'quantityUsed', e.target.value)}
                  className={`form-input ${refError?.quantityUsed ? 'error' : ''}`}
                  disabled={disabled}
                  placeholder="Qty"
                  aria-label={`Input reference ${index + 1} quantity used`}
                />
                {refError?.quantityUsed && <div className="form-error">{refError.quantityUsed}</div>}
              </div>
              <div>
                <input
                  type="text"
                  value={ref.unit}
                  onChange={(e) => updateInputReference(index, 'unit', e.target.value)}
                  className={`form-input ${refError?.unit ? 'error' : ''}`}
                  disabled={disabled}
                  placeholder="Unit"
                  aria-label={`Input reference ${index + 1} unit`}
                />
                {refError?.unit && <div className="form-error">{refError.unit}</div>}
              </div>
              <button
                type="button"
                onClick={() => removeInputReference(index)}
                disabled={disabled}
                className="btn btn-danger btn-sm"
                aria-label={`Remove input reference ${index + 1}`}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="submit"
        disabled={disabled}
        className="btn btn-primary btn-full"
      >
        {disabled ? 'Submitting...' : 'Sign & Submit Attestation'}
      </button>
    </form>
  );
}
