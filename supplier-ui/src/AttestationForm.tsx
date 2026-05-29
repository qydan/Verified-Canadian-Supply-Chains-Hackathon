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
}

export function AttestationForm({ onSubmit, disabled = false }: AttestationFormProps) {
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

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '0.9rem',
    boxSizing: 'border-box',
  };

  const errorFieldStyle: React.CSSProperties = {
    ...fieldStyle,
    borderColor: '#e74c3c',
  };

  const errorTextStyle: React.CSSProperties = {
    color: '#e74c3c',
    fontSize: '0.8rem',
    marginTop: '0.25rem',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontWeight: 600,
    marginBottom: '0.25rem',
    fontSize: '0.9rem',
  };

  const fieldGroupStyle: React.CSSProperties = {
    marginBottom: '1rem',
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={fieldGroupStyle}>
        <label style={labelStyle} htmlFor="productName">Product Name *</label>
        <input
          id="productName"
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          style={errors.productName ? errorFieldStyle : fieldStyle}
          disabled={disabled}
          placeholder="e.g., Maple Syrup Grade A"
        />
        {errors.productName && <div style={errorTextStyle}>{errors.productName}</div>}
      </div>

      <div style={fieldGroupStyle}>
        <label style={labelStyle} htmlFor="productId">Product ID *</label>
        <input
          id="productId"
          type="text"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          style={errors.productId ? errorFieldStyle : fieldStyle}
          disabled={disabled}
          placeholder="e.g., 550e8400-e29b-41d4-a716-446655440000"
        />
        {errors.productId && <div style={errorTextStyle}>{errors.productId}</div>}
      </div>

      <div style={fieldGroupStyle}>
        <label style={labelStyle} htmlFor="location">Location *</label>
        <select
          id="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          style={errors.location ? errorFieldStyle : fieldStyle}
          disabled={disabled}
        >
          <option value="">Select country...</option>
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        {errors.location && <div style={errorTextStyle}>{errors.location}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={labelStyle} htmlFor="materialCost">Material Cost *</label>
          <input
            id="materialCost"
            type="number"
            min="0"
            step="0.01"
            value={materialCost}
            onChange={(e) => setMaterialCost(e.target.value)}
            style={errors.materialCost ? errorFieldStyle : fieldStyle}
            disabled={disabled}
            placeholder="0.00"
          />
          {errors.materialCost && <div style={errorTextStyle}>{errors.materialCost}</div>}
        </div>
        <div>
          <label style={labelStyle} htmlFor="labourCost">Labour Cost *</label>
          <input
            id="labourCost"
            type="number"
            min="0"
            step="0.01"
            value={labourCost}
            onChange={(e) => setLabourCost(e.target.value)}
            style={errors.labourCost ? errorFieldStyle : fieldStyle}
            disabled={disabled}
            placeholder="0.00"
          />
          {errors.labourCost && <div style={errorTextStyle}>{errors.labourCost}</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={labelStyle} htmlFor="outputQuantity">Output Quantity *</label>
          <input
            id="outputQuantity"
            type="number"
            min="0.01"
            step="0.01"
            value={outputQuantity}
            onChange={(e) => setOutputQuantity(e.target.value)}
            style={errors.outputQuantity ? errorFieldStyle : fieldStyle}
            disabled={disabled}
            placeholder="1"
          />
          {errors.outputQuantity && <div style={errorTextStyle}>{errors.outputQuantity}</div>}
        </div>
        <div>
          <label style={labelStyle} htmlFor="outputUnit">Output Unit *</label>
          <input
            id="outputUnit"
            type="text"
            value={outputUnit}
            onChange={(e) => setOutputUnit(e.target.value)}
            style={errors.outputUnit ? errorFieldStyle : fieldStyle}
            disabled={disabled}
            placeholder="e.g., kg, L, units"
          />
          {errors.outputUnit && <div style={errorTextStyle}>{errors.outputUnit}</div>}
        </div>
      </div>

      <div style={{ ...fieldGroupStyle, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          id="isTransformation"
          type="checkbox"
          checked={isTransformation}
          onChange={(e) => setIsTransformation(e.target.checked)}
          disabled={disabled}
          style={{ width: '1.2rem', height: '1.2rem' }}
        />
        <label htmlFor="isTransformation" style={{ fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
          Is Transformation Step
        </label>
      </div>

      <div style={{ marginBottom: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem' }}>Input References</h3>
          <button
            type="button"
            onClick={addInputReference}
            disabled={disabled}
            style={{
              background: '#27ae60',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '0.4rem 0.75rem',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            + Add Input
          </button>
        </div>

        {inputReferences.length === 0 && (
          <p style={{ color: '#888', fontSize: '0.85rem', fontStyle: 'italic' }}>
            No input references. Click "Add Input" to reference upstream attestations.
          </p>
        )}

        {inputReferences.map((ref, index) => {
          const refError = errors.inputReferences?.[index];
          return (
            <div
              key={index}
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr auto',
                gap: '0.5rem',
                alignItems: 'start',
                marginBottom: '0.75rem',
                padding: '0.75rem',
                background: '#f9f9f9',
                borderRadius: '4px',
                border: '1px solid #eee',
              }}
            >
              <div>
                <input
                  type="text"
                  value={ref.attestationId}
                  onChange={(e) => updateInputReference(index, 'attestationId', e.target.value)}
                  style={refError?.attestationId ? errorFieldStyle : fieldStyle}
                  disabled={disabled}
                  placeholder="Attestation ID"
                  aria-label={`Input reference ${index + 1} attestation ID`}
                />
                {refError?.attestationId && <div style={errorTextStyle}>{refError.attestationId}</div>}
              </div>
              <div>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={ref.quantityUsed}
                  onChange={(e) => updateInputReference(index, 'quantityUsed', e.target.value)}
                  style={refError?.quantityUsed ? errorFieldStyle : fieldStyle}
                  disabled={disabled}
                  placeholder="Qty"
                  aria-label={`Input reference ${index + 1} quantity used`}
                />
                {refError?.quantityUsed && <div style={errorTextStyle}>{refError.quantityUsed}</div>}
              </div>
              <div>
                <input
                  type="text"
                  value={ref.unit}
                  onChange={(e) => updateInputReference(index, 'unit', e.target.value)}
                  style={refError?.unit ? errorFieldStyle : fieldStyle}
                  disabled={disabled}
                  placeholder="Unit"
                  aria-label={`Input reference ${index + 1} unit`}
                />
                {refError?.unit && <div style={errorTextStyle}>{refError.unit}</div>}
              </div>
              <button
                type="button"
                onClick={() => removeInputReference(index)}
                disabled={disabled}
                style={{
                  background: '#e74c3c',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.4rem 0.6rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  marginTop: '0.1rem',
                }}
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
        style={{
          width: '100%',
          padding: '0.75rem',
          background: disabled ? '#95a5a6' : '#2c3e50',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {disabled ? 'Submitting...' : 'Sign & Submit Attestation'}
      </button>
    </form>
  );
}
