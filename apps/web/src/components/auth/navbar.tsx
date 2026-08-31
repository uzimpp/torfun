import { LogoutButton } from './logout-button';

type NavbarProps = {
  username: string;
};

export function Navbar({ username }: NavbarProps) {
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div>
          <span className="text-xl font-bold text-gray-900">Torfun</span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            Welcome, <span className="font-medium text-gray-900">{username}</span>
          </span>

          <LogoutButton />
        </div>
      </div>
    </nav>
  );
}
