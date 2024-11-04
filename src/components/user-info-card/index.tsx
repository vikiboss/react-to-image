import React from "react";

interface UserInfoCardProps {
	name: string;
}

export default function UserInfoCard(props: UserInfoCardProps) {
	return (
		<div>
			<h1 className="text-3xl text-amber-6">{props.name}</h1>
		</div>
	);
}
