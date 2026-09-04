export default function SignupPage() {
    return (
        // background
        <div className="flex items-center justify-center w-full min-h-screen bg-gradient-to-b from-[#2B4C9B] to-[#F7F8FC]">

            {/* Form */}
                <main className="flex flex-col justify-center bg-[#F7F8FC] w-auto h-auto p-10 rounded-xl shadow-lg">

                    {/* Create Account Message */}
                    <div className="mb-6">
                        <h1 className="font-[Sarabun] font-bold text-2xl text-[#1B2338] text-left">Create an account</h1>
                        <p className="font-[Sarabun] text-sm text-[#1B2338] text-left opacity-80">Please enter your details to create an account</p>
                    </div>
                
                    {/* Signup Form */}
                    <div className="flex flex-col gap-2">
                        {/* Email */}
                        <label htmlFor="email" className="font-[Sarabun] text-[#1B2338] text-left">Email</label>
                        <input id="email" type="email" placeholder="Enter your email"
                                className="border border-gray-300 rounded-md px-4 py-2 text-gray-500 w-90 font-[Sarabun] text-[#1B2338] mb-4"
                        ></input>

                        {/* Username */}
                        <label htmlFor="username" className="font-[Sarabun] text-[#1B2338] text-left">Username</label>
                        <input id="username" type="text" placeholder="Enter your username"
                                className="border border-gray-300 rounded-md px-4 py-2 text-gray-500 w-90 font-[Sarabun] text-[#1B2338] mb-4"
                        ></input>

                        {/* Password */}
                        <label htmlFor="password" className="font-[Sarabun] text-[#1B2338] text-left">Password</label>
                        <input id="password" type="password" placeholder="Enter your password"
                                className="border border-gray-300 rounded-md px-4 py-2 text-gray-500 w-90 font-[Sarabun] text-[#1B2338]"
                        ></input>

                        {/* Signup Button */}
                        <button className="bg-[#2B4C9B] font-bold font-[Sarabun] text-white py-2 rounded-md mt-6
                                    hover:bg-[#1B2338] transition-colors duration-200">Sign up</button>
                    </div>

                    {/* -- OR -- */}
                    <div className="flex items-center my-4">
                        <hr className="flex-1 border-gray-300"/>
                        <span className="font-[Sarabun] text-[#1B2338] opacity-40 mx-4 ">OR</span>
                        <hr className="flex-1 border-gray-300"/>
                    </div>

                    {/* Google Signup */}
                    <div className="flex flex-col items-center">

                    <button className="flex items-center justify-center w-90 bg-[#F7F8FC] font-bold font-[Sarabun] text-[#1B2338] py-2 rounded-md border border-gray-300 shadow gap-3
                                    hover:bg-gray-200 transition-colors duration-200">
                        {/* Google Logo */}
                        <img src="/icons/google.svg" alt="Google" className="w-6 h-6"/>
                    Continue with Google</button>

                    <span className="font-[Sarabun] text-sm text-[#1B2338] mt-4">
                        Already have an account?
                        <a href="/login" className="underline font-[Sarabun] text-sm text-[#2B4C9B]"> Log in here</a>
                    </span>
                    </div>
                </main>
            
        </div>
    )
}