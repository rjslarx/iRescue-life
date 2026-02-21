import SignupForm from '../SignupForm';

export default function SignupFormExample() {
  return (
    <SignupForm 
      onSubmit={(data) => console.log('Signup data:', data)}
    />
  );
}
