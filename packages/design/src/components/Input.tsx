import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

interface FieldWrapperProps {
	label?:     string | undefined;
	hint?:      string | undefined;
	error?:     string | undefined;
	className?: string | undefined;
	children:   ReactNode;
}

function FieldWrapper( { label, hint, error, className = '', children }: FieldWrapperProps ) {
	return (
		<div className={ `bw-field ${ className }`.trim() }>
			{ label && <label className="bw-label">{ label }</label> }
			{ children }
			{ error  && <span className="bw-field__error" role="alert">{ error }</span> }
			{ ! error && hint && <span className="bw-field__hint">{ hint }</span> }
		</div>
	);
}

// ── Input ─────────────────────────────────────────────────────────────────

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	label?:     string;
	hint?:      string;
	error?:     string;
	wrapClass?: string;
}

export function Input( { label, hint, error, wrapClass, className = '', ...rest }: InputProps ) {
	const inputClass = [
		'bw-input',
		error && 'bw-input--error',
		className,
	].filter( Boolean ).join( ' ' );

	return (
		<FieldWrapper label={ label } hint={ hint } error={ error } className={ wrapClass }>
			<input { ...rest } className={ inputClass } aria-invalid={ !! error || undefined } />
		</FieldWrapper>
	);
}

// ── Textarea ──────────────────────────────────────────────────────────────

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
	label?:     string;
	hint?:      string;
	error?:     string;
	wrapClass?: string;
}

export function Textarea( { label, hint, error, wrapClass, className = '', ...rest }: TextareaProps ) {
	const textareaClass = [
		'bw-input',
		'bw-textarea',
		error && 'bw-input--error',
		className,
	].filter( Boolean ).join( ' ' );

	return (
		<FieldWrapper label={ label } hint={ hint } error={ error } className={ wrapClass }>
			<textarea { ...rest } className={ textareaClass } aria-invalid={ !! error || undefined } />
		</FieldWrapper>
	);
}

// ── Select ────────────────────────────────────────────────────────────────

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
	label?:     string;
	hint?:      string;
	error?:     string;
	wrapClass?: string;
}

export function Select( { label, hint, error, wrapClass, className = '', ...rest }: SelectProps ) {
	const selectClass = [
		'bw-input',
		'bw-select',
		error && 'bw-input--error',
		className,
	].filter( Boolean ).join( ' ' );

	return (
		<FieldWrapper label={ label } hint={ hint } error={ error } className={ wrapClass }>
			<select { ...rest } className={ selectClass } aria-invalid={ !! error || undefined } />
		</FieldWrapper>
	);
}
