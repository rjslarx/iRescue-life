import LoginForm from '../LoginForm';

export default function LoginFormExample() {
  return (
    <LoginForm 
      rescueName="Sunny Paws Rescue"
      onSubmit={(email, password) => console.log('Login:', { email, password })}
    />
  );
}
